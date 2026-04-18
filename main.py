# -*- coding: utf-8 -*-
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import time
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
FIXSTARS_API_KEY = os.environ.get("FIXSTARS_API_KEY", "")
NAVITIME_API_KEY = os.environ.get("NAVITIME_API_KEY", "")
NAVITIME_API_HOST = "navitime-route-totalnavi.p.rapidapi.com"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://haisha-app.vercel.app", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 入力データの構造定義
# ==========================================
class Member(BaseModel):
    name: str
    station: str
    can_drive: bool
    capacity: Optional[int] = None
    want_with: Optional[List[str]] = []
    awkward_with: Optional[List[str]] = []

class EventData(BaseModel):
    members: List[Member]
    target_arrival: Optional[str] = ""
    p_score: Optional[int] = -5

class FormConfig(BaseModel):
    access_token: str
    event_name: str = "イベント参加フォーム"

class SheetConfig(BaseModel):
    access_token: str
    spreadsheet_id: str

# ==========================================
# 配車計算エンドポイント
# ==========================================
@app.post("/assign")
async def assign_members(data: EventData):
    members = data.members
    drivers = [m for m in members if m.can_drive]
    passengers = [m for m in members if not m.can_drive]

    if not drivers:
        return {"error": "運転手が1人もいません。"}
    if not passengers:
        return {"error": "乗客が1人もいません。"}

    C = [(d.capacity or 4) for d in drivers]
    total_seats = sum(c - 1 for c in C)

    if len(passengers) > total_seats:
        return {"error": f"有効シート数({total_seats}席)が乗客数({len(passengers)}名)より少ないため、全員を配車できません。"}

    W, driver_W = build_relation_matrix(passengers, drivers, data.p_score or -5)

    d_matrix = None
    if NAVITIME_API_KEY and GOOGLE_MAPS_API_KEY:
        try:
            target_arrival = None
            if data.target_arrival:
                try:
                    target_arrival = datetime.fromisoformat(data.target_arrival)
                except ValueError:
                    pass
            if target_arrival is None:
                target_arrival = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
            d_matrix = get_distance_matrix_navitime(
                [p.station for p in passengers],
                [d.station for d in drivers],
                target_arrival
            )
        except Exception:
            d_matrix = None

    if d_matrix is None:
        d_matrix = [[0] * len(drivers) for _ in range(len(passengers))]

    if FIXSTARS_API_KEY:
        try:
            result = run_optimization_amplify(
                passengers, drivers, d_matrix, C, W, driver_W, FIXSTARS_API_KEY
            )
            return result
        except Exception:
            pass

    return run_greedy_assignment(passengers, drivers, d_matrix, C, W, driver_W)


# ==========================================
# 人間関係行列の生成
# ==========================================
def build_relation_matrix(
    passengers: List[Member],
    drivers: List[Member],
    p_score: int
):
    n_passengers = len(passengers)
    n_drivers = len(drivers)

    p_idx_map = {p.name: i for i, p in enumerate(passengers)}
    d_idx_map = {d.name: k for k, d in enumerate(drivers)}

    pref_p2p = {i: {j: 'NEUTRAL' for j in range(n_passengers)} for i in range(n_passengers)}
    pref_p2d = {i: {k: 'NEUTRAL' for k in range(n_drivers)} for i in range(n_passengers)}
    pref_d2p = {k: {i: 'NEUTRAL' for i in range(n_passengers)} for k in range(n_drivers)}

    for i, p in enumerate(passengers):
        for person in (p.want_with or []):
            person = person.strip()
            if person in p_idx_map:
                pref_p2p[i][p_idx_map[person]] = 'WANT'
            elif person in d_idx_map:
                pref_p2d[i][d_idx_map[person]] = 'WANT'
        for person in (p.awkward_with or []):
            person = person.strip()
            if person in p_idx_map:
                pref_p2p[i][p_idx_map[person]] = 'AWKWARD'
            elif person in d_idx_map:
                pref_p2d[i][d_idx_map[person]] = 'AWKWARD'

    for k, d in enumerate(drivers):
        for person in (d.want_with or []):
            person = person.strip()
            if person in p_idx_map:
                pref_d2p[k][p_idx_map[person]] = 'WANT'
        for person in (d.awkward_with or []):
            person = person.strip()
            if person in p_idx_map:
                pref_d2p[k][p_idx_map[person]] = 'AWKWARD'

    W = [[0] * n_passengers for _ in range(n_passengers)]
    for i in range(n_passengers):
        for j in range(i + 1, n_passengers):
            p1 = pref_p2p[i][j]
            p2 = pref_p2p[j][i]
            if p1 == 'AWKWARD' or p2 == 'AWKWARD':
                score = 100
            elif p1 == 'WANT' or p2 == 'WANT':
                score = p_score
            else:
                score = 0
            W[i][j] = score
            W[j][i] = score

    driver_W = [[0] * n_drivers for _ in range(n_passengers)]
    for i in range(n_passengers):
        for k in range(n_drivers):
            p1 = pref_p2d[i][k]
            p2 = pref_d2p[k][i]
            if p1 == 'AWKWARD' or p2 == 'AWKWARD':
                score = 100
            elif p1 == 'WANT' or p2 == 'WANT':
                score = p_score
            else:
                score = 0
            driver_W[i][k] = score

    return W, driver_W


# ==========================================
# NAVITIME API による所要時間行列取得（キャッシュ付き）
# ==========================================
CACHE_FILE = 'distance_cache.json'
USAGE_FILE = 'usage_stats.json'
COORD_CACHE_FILE = 'coord_cache.json'
RATE_LIMIT_PER_MIN = 50

def load_json(filename, default):
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    return default

def save_json(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def get_coords_with_cache(station_name: str, coord_cache: dict) -> Optional[dict]:
    if station_name in coord_cache:
        return coord_cache[station_name]

    import googlemaps
    gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY)
    result = gmaps.geocode(station_name)
    if not result:
        return None

    loc = result[0]['geometry']['location']
    coord = {"lat": loc['lat'], "lon": loc['lng']}
    coord_cache[station_name] = coord
    save_json(COORD_CACHE_FILE, coord_cache)
    return coord

def call_navitime_api(start_coord: dict, goal_coord: dict, target_arrival: datetime) -> Optional[int]:
    url = f"https://{NAVITIME_API_HOST}/route_transit"
    arrival_str = target_arrival.strftime('%Y-%m-%dT%H:%M:%S')

    response = requests.get(
        url,
        headers={"X-RapidAPI-Key": NAVITIME_API_KEY, "X-RapidAPI-Host": NAVITIME_API_HOST},
        params={
            "start": f"{start_coord['lat']},{start_coord['lon']}",
            "goal": f"{goal_coord['lat']},{goal_coord['lon']}",
            "goal_time": arrival_str,
            "limit": "1"
        }
    )

    if response.status_code != 200:
        return None

    try:
        data = response.json()
        sections = data['items'][0].get('sections', [])
        train_sections = [
            s for s in sections
            if s.get('type') == 'move'
            and s.get('move') != 'walk'
            and s.get('line_name') != '徒歩'
        ]
        if not train_sections:
            return data['items'][0]['summary']['move']['time']

        start_dt = datetime.fromisoformat(train_sections[0]['from_time'].replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(train_sections[-1]['to_time'].replace('Z', '+00:00'))
        return int((end_dt - start_dt).total_seconds() / 60)
    except (KeyError, IndexError, ValueError):
        return None

def get_distance_matrix_navitime(
    passenger_stations: List[str],
    driver_stations: List[str],
    target_arrival: datetime
) -> List[List[int]]:
    cache = load_json(CACHE_FILE, {})
    coord_cache = load_json(COORD_CACHE_FILE, {})
    usage = load_json(USAGE_FILE, {"navitime_calls": 0})

    api_counter = 0
    d_matrix = []

    for p_station in passenger_stations:
        row = []
        p_coord = get_coords_with_cache(p_station, coord_cache)

        for d_station in driver_stations:
            cache_key = f"{p_station}_{d_station}"

            if p_station == d_station:
                row.append(0)
                continue
            if cache_key in cache:
                row.append(cache[cache_key])
                continue

            if api_counter > 0 and api_counter % RATE_LIMIT_PER_MIN == 0:
                time.sleep(60)

            d_coord = get_coords_with_cache(d_station, coord_cache)

            if not p_coord or not d_coord:
                duration = 999
            else:
                duration = call_navitime_api(p_coord, d_coord, target_arrival)
                if duration is None:
                    duration = 999
                api_counter += 1
                usage["navitime_calls"] += 1

            cache[cache_key] = duration
            row.append(duration)
            save_json(CACHE_FILE, cache)
            save_json(USAGE_FILE, usage)

        d_matrix.append(row)

    return d_matrix


# ==========================================
# Amplify による最適化配車
# ==========================================
def run_optimization_amplify(
    passengers: List[Member],
    drivers: List[Member],
    d_matrix: List[List[int]],
    C: List[int],
    W: List[List[int]],
    driver_W: List[List[int]],
    fixstars_key: str
) -> dict:
    from amplify import VariableGenerator, Model, solve, equal_to, less_equal
    from amplify.client import FixstarsClient
    from amplify import sum as asum

    num_people = len(passengers)
    num_cars = len(drivers)

    alpha = 1.0
    beta = 1.0
    lambda_1 = 5000.0
    lambda_2 = 5000.0

    gen = VariableGenerator()
    x = gen.array("Binary", (num_people, num_cars))

    distance_cost = asum(
        d_matrix[i][k] * x[i, k]
        for i in range(num_people)
        for k in range(num_cars)
    )
    relation_cost = asum(
        W[i][j] * x[i, k] * x[j, k]
        for i in range(num_people)
        for j in range(i + 1, num_people)
        for k in range(num_cars)
    )
    driver_relation_cost = asum(
        driver_W[i][k] * x[i, k]
        for i in range(num_people)
        for k in range(num_cars)
    )
    objective = alpha * distance_cost + beta * relation_cost + beta * driver_relation_cost

    one_hot_constraints = [
        equal_to(asum(x[i, k] for k in range(num_cars)), 1)
        for i in range(num_people)
    ]
    capacity_constraints = [
        less_equal(asum(x[i, k] for i in range(num_people)), C[k] - 1)
        for k in range(num_cars)
    ]
    constraints = asum(c * lambda_1 for c in one_hot_constraints) + \
                  asum(c * lambda_2 for c in capacity_constraints)

    model = Model(objective, constraints)
    client = FixstarsClient()
    client.token = fixstars_key
    client.parameters.timeout = 1500

    result = solve(model, client)
    if len(result) == 0:
        return {"error": "Amplifyで解が見つかりませんでした。"}

    best = result[0]
    x_opt = x.evaluate(best.values)

    assignments = []
    assigned_ids = set()
    for k in range(num_cars):
        car_passengers = []
        for i in range(num_people):
            if int(x_opt[i][k]) == 1:
                car_passengers.append(f"{passengers[i].name} ({passengers[i].station}駅)")
                assigned_ids.add(i)
        assignments.append({
            "car_id": k + 1,
            "driver": f"{drivers[k].name} ({drivers[k].station}駅)",
            "members": [f"{drivers[k].name} (運転手 - {drivers[k].station}駅)"] + car_passengers,
            "feasible": best.feasible
        })

    unassigned = [passengers[i].name for i in range(num_people) if i not in assigned_ids]
    return {
        "assignments": assignments,
        "unassigned": unassigned,
        "method": "amplify",
        "objective": float(best.objective),
        "feasible": best.feasible
    }


# ==========================================
# フォールバック：グリーディ配車
# ==========================================
def run_greedy_assignment(
    passengers: List[Member],
    drivers: List[Member],
    d_matrix: List[List[int]],
    C: List[int],
    W: List[List[int]],
    driver_W: List[List[int]]
) -> dict:
    num_people = len(passengers)
    num_cars = len(drivers)

    assignment = [-1] * num_people
    car_counts = [0] * num_cars

    for i in range(num_people):
        best_car = -1
        best_score = float('inf')
        for k in range(num_cars):
            if car_counts[k] >= C[k] - 1:
                continue
            score = d_matrix[i][k] + driver_W[i][k]
            for j in range(num_people):
                if assignment[j] == k:
                    score += W[i][j]
            if score < best_score:
                best_score = score
                best_car = k
        if best_car != -1:
            assignment[i] = best_car
            car_counts[best_car] += 1

    assignments = []
    for k in range(num_cars):
        car_passengers = [
            f"{passengers[i].name} ({passengers[i].station}駅)"
            for i in range(num_people) if assignment[i] == k
        ]
        assignments.append({
            "car_id": k + 1,
            "driver": f"{drivers[k].name} ({drivers[k].station}駅)",
            "members": [f"{drivers[k].name} (運転手 - {drivers[k].station}駅)"] + car_passengers
        })

    unassigned = [passengers[i].name for i in range(num_people) if assignment[i] == -1]
    return {
        "assignments": assignments,
        "unassigned": unassigned,
        "method": "greedy"
    }


# ==========================================
# Google Forms API - フォーム自動作成
# ==========================================
@app.post("/create-form")
async def create_form(config: FormConfig):
    import requests

    headers = {
        "Authorization": f"Bearer {config.access_token}",
        "Content-Type": "application/json"
    }

    form_body = {
        "info": {
            "title": config.event_name,
            "documentTitle": config.event_name
        }
    }

    res = requests.post(
        "https://forms.googleapis.com/v1/forms",
        headers=headers,
        json=form_body
    )

    if res.status_code != 200:
        return {"error": f"フォーム作成に失敗しました: {res.text}"}

    form = res.json()
    form_id = form["formId"]

    questions = [
        {"title": "名前", "required": True, "type": "SHORT_ANSWER"},
        {"title": "最寄り駅", "required": True, "type": "SHORT_ANSWER"},
        {"title": "参加形態", "required": True, "type": "RADIO", "options": ["運転手", "乗客"]},
        {"title": "定員（運転手の方のみ・数字で入力）", "required": False, "type": "SHORT_ANSWER"},
        {"title": "一緒になりたい人（カンマ区切り）", "required": False, "type": "SHORT_ANSWER"},
        {"title": "気まずい人（カンマ区切り）", "required": False, "type": "SHORT_ANSWER"},
    ]

    requests_body = {"requests": []}
    for idx, q in enumerate(questions):
        item = {
            "createItem": {
                "item": {
                    "title": q["title"],
                    "questionItem": {
                        "question": {"required": q["required"]}
                    }
                },
                "location": {"index": idx}
            }
        }
        if q["type"] == "SHORT_ANSWER":
            item["createItem"]["item"]["questionItem"]["question"]["textQuestion"] = {}
        elif q["type"] == "RADIO":
            item["createItem"]["item"]["questionItem"]["question"]["choiceQuestion"] = {
                "type": "RADIO",
                "options": [{"value": opt} for opt in q["options"]]
            }
        requests_body["requests"].append(item)

    batch_res = requests.post(
        f"https://forms.googleapis.com/v1/forms/{form_id}:batchUpdate",
        headers=headers,
        json=requests_body
    )

    if batch_res.status_code != 200:
        return {"error": f"質問の追加に失敗しました: {batch_res.text}"}

    return {
        "form_id": form_id,
        "form_url": f"https://docs.google.com/forms/d/{form_id}/viewform",
        "edit_url": f"https://docs.google.com/forms/d/{form_id}/edit",
        "sheet_url": f"https://docs.google.com/forms/d/{form_id}/edit#responses",
    }


# ==========================================
# Google Sheets API - 回答の自動取得
# ==========================================
@app.post("/get-responses")
async def get_responses(config: SheetConfig):
    import requests

    headers = {"Authorization": f"Bearer {config.access_token}"}

    res = requests.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{config.spreadsheet_id}/values/A:Z",
        headers=headers
    )

    if res.status_code != 200:
        return {"error": f"データの取得に失敗しました: {res.text}"}

    data = res.json()
    rows = data.get("values", [])

    if len(rows) < 2:
        return {"error": "回答がまだありません。"}

    headers_row = rows[0]
    members = []

    for row in rows[1:]:
        entry = {}
        for i, header in enumerate(headers_row):
            entry[header] = row[i] if i < len(row) else ""

        name = entry.get("名前", "").strip()
        station = entry.get("最寄り駅", "").strip()
        role = entry.get("参加形態", "乗客").strip()
        capacity = entry.get("定員（運転手の方のみ・数字で入力）", "4").strip()
        want_with = entry.get("一緒になりたい人（カンマ区切り）", "").strip()
        awkward_with = entry.get("気まずい人（カンマ区切り）", "").strip()

        if not name or not station:
            continue

        members.append({
            "name": name,
            "station": station,
            "can_drive": role == "運転手",
            "capacity": int(capacity) if capacity.isdigit() else 4,
            "want_with": [w.strip() for w in want_with.split(",") if w.strip()],
            "awkward_with": [a.strip() for a in awkward_with.split(",") if a.strip()],
        })

    return {"members": members, "count": len(members)}

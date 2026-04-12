# -*- coding: utf-8 -*-
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import sys
from dotenv import load_dotenv

load_dotenv()

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
FIXSTARS_API_KEY = os.environ.get("FIXSTARS_API_KEY", "")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://haisha-app.vercel.app", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

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

# ==========================================
# ルーティング
# ==========================================
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {})


@app.post("/assign")
async def assign_members(data: EventData):
    members = data.members
    drivers = [m for m in members if m.can_drive]
    passengers = [m for m in members if not m.can_drive]

    if not drivers:
        return {"error": "運転手が1人もいません。"}
    if not passengers:
        return {"error": "乗客が1人もいません。"}

    # 各車の定員リスト（運転手含む）
    C = [(d.capacity or 4) for d in drivers]
    total_seats = sum(c - 1 for c in C)

    if len(passengers) > total_seats:
        return {"error": f"有効シート数({total_seats}席)が乗客数({len(passengers)}名)より少ないため、全員を配車できません。"}

    # 人間関係行列の生成（乗客同士 W、乗客-運転手 driver_W）
    W, driver_W = build_relation_matrix(passengers, drivers, data.p_score or -5)

    # Google Maps Distance Matrix APIで移動時間行列を取得
    d_matrix = None
    if GOOGLE_MAPS_API_KEY:
        try:
            d_matrix = get_distance_matrix(
                [p.station for p in passengers],
                [d.station for d in drivers],
                GOOGLE_MAPS_API_KEY,
                data.target_arrival
            )
        except Exception as e:
            d_matrix = None

    if d_matrix is None:
        d_matrix = [[0] * len(drivers) for _ in range(len(passengers))]

    # Amplifyによる最適化
    if FIXSTARS_API_KEY:
        try:
            result = run_optimization_amplify(
                passengers, drivers, d_matrix, C, W, driver_W, FIXSTARS_API_KEY
            )
            return result
        except Exception:
            pass

    # フォールバック：グリーディ配車
    return run_greedy_assignment(passengers, drivers, d_matrix, C, W, driver_W)


# ==========================================
# 人間関係行列の生成
# W：乗客同士、driver_W：乗客と運転手
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

    # 感情辞書の初期化
    pref_p2p = {i: {j: 'NEUTRAL' for j in range(n_passengers)} for i in range(n_passengers)}
    pref_p2d = {i: {k: 'NEUTRAL' for k in range(n_drivers)} for i in range(n_passengers)}
    pref_d2p = {k: {i: 'NEUTRAL' for i in range(n_passengers)} for k in range(n_drivers)}

    # 乗客の感情を処理
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

    # 運転手の感情を処理
    for k, d in enumerate(drivers):
        for person in (d.want_with or []):
            person = person.strip()
            if person in p_idx_map:
                pref_d2p[k][p_idx_map[person]] = 'WANT'
        for person in (d.awkward_with or []):
            person = person.strip()
            if person in p_idx_map:
                pref_d2p[k][p_idx_map[person]] = 'AWKWARD'

    # 乗客同士の行列 W を確定
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

    # 乗客-運転手の行列 driver_W を確定
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
# Google Maps Distance Matrix API（バッチ処理＋キャッシュ付き）
# ==========================================
CACHE_FILE = 'distance_cache.json'
USAGE_FILE = 'usage_stats.json'
MONTHLY_LIMIT = 5000

def load_json(filename, default):
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            return json.load(f)
    return default

def save_json(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def get_distance_matrix(
    passenger_stations: List[str],
    driver_stations: List[str],
    api_key: str,
    target_arrival_str: str = ""
) -> List[List[int]]:
    import googlemaps
    from datetime import datetime

    gmaps = googlemaps.Client(key=api_key)
    cache = load_json(CACHE_FILE, {})
    usage = load_json(USAGE_FILE, {"total_elements": 0})

    # キャッシュにない乗客駅を抽出
    missing_p_stations = []
    for p in passenger_stations:
        for d in driver_stations:
            if f"{p}_{d}" not in cache:
                if p not in missing_p_stations:
                    missing_p_stations.append(p)

    # バッチ処理（100要素制限対策）
    if missing_p_stations:
        max_p_per_request = max(1, min(25, 100 // len(driver_stations)))

        for i in range(0, len(missing_p_stations), max_p_per_request):
            chunk = missing_p_stations[i: i + max_p_per_request]
            requested = len(chunk) * len(driver_stations)

            if usage["total_elements"] + requested > MONTHLY_LIMIT:
                raise Exception("APIの月間使用上限に達しました。")

            kwargs = dict(
                origins=chunk,
                destinations=driver_stations,
                mode="transit",
                language="ja",
                transit_mode=["bus", "rail"]
            )
            if target_arrival_str:
                try:
                    kwargs["arrival_time"] = datetime.fromisoformat(target_arrival_str)
                except ValueError:
                    pass

            result = gmaps.distance_matrix(**kwargs)

            for p_idx, row in enumerate(result['rows']):
                p_station = chunk[p_idx]
                for d_idx, element in enumerate(row['elements']):
                    d_station = driver_stations[d_idx]
                    key = f"{p_station}_{d_station}"
                    cache[key] = element['duration']['value'] // 60 if element['status'] == 'OK' else 999

            usage["total_elements"] += requested

        save_json(USAGE_FILE, usage)
        save_json(CACHE_FILE, cache)

    return [
        [cache.get(f"{p}_{d}", 999) for d in driver_stations]
        for p in passenger_stations
    ]


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

    # 目的関数
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

    # 制約条件
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
            # 移動時間コスト + 乗客同士の人間関係 + 運転手との人間関係
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
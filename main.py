# -*- coding: utf-8 -*-
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import sys

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ==========================================
# 入力データの構造定義
# ==========================================
class Member(BaseModel):
    name: str
    station: str
    can_drive: bool
    capacity: Optional[int] = None       # 運転手の場合の定員（運転手含む）
    want_with: Optional[List[str]] = []  # 一緒になりたい人のリスト
    awkward_with: Optional[List[str]] = []  # 気まずい人のリスト

class EventData(BaseModel):
    members: List[Member]
    google_maps_api_key: Optional[str] = ""
    fixstars_api_key: Optional[str] = ""
    target_arrival: Optional[str] = ""   # "YYYY-MM-DDTHH:MM" 形式
    p_score: Optional[int] = -5          # 仲が良い場合の報酬スコア

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

    # 定員チェック
    total_seats = sum((m.capacity or 4) - 1 for m in drivers)
    if len(passengers) > total_seats:
        return {"error": f"有効シート数({total_seats}席)が乗客数({len(passengers)}名)より少ないため、全員を配車できません。"}

    # Google Maps API で移動時間行列を取得（APIキーがある場合）
    d_matrix = None
    if data.google_maps_api_key:
        try:
            d_matrix = get_distance_matrix(
                [p.station for p in passengers],
                [d.station for d in drivers],
                data.google_maps_api_key,
                data.target_arrival
            )
        except Exception as e:
            # API失敗時は均一コストにフォールバック
            d_matrix = None

    # 移動時間行列がない場合は均一コスト（0）を使用
    if d_matrix is None:
        d_matrix = [[0] * len(drivers) for _ in range(len(passengers))]

    # 人間関係行列 W を生成
    W = build_relation_matrix(passengers, data.p_score or -5)

    # Amplifyによる最適化 or フォールバック
    if data.fixstars_api_key:
        try:
            result = run_optimization_amplify(
                passengers, drivers, d_matrix, W, data.fixstars_api_key
            )
            return result
        except Exception as e:
            # Amplify失敗時はグリーディにフォールバック
            pass

    # フォールバック：グリーディ配車（移動時間最小化＋人間関係考慮）
    result = run_greedy_assignment(passengers, drivers, d_matrix, W)
    return result


# ==========================================
# 人間関係行列 W の生成
# ==========================================
def build_relation_matrix(passengers: List[Member], p_score: int) -> List[List[int]]:
    n = len(passengers)
    name_to_idx = {p.name: i for i, p in enumerate(passengers)}

    # pref[i][j]: i が j に対してどう思っているか ('NEUTRAL' / 'WANT' / 'AWKWARD')
    pref = {i: {j: 'NEUTRAL' for j in range(n)} for i in range(n)}

    for i, p in enumerate(passengers):
        for friend in (p.want_with or []):
            if friend in name_to_idx:
                pref[i][name_to_idx[friend]] = 'WANT'
        for awkward in (p.awkward_with or []):
            if awkward in name_to_idx:
                pref[i][name_to_idx[awkward]] = 'AWKWARD'

    W = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            p1 = pref[i][j]
            p2 = pref[j][i]
            if p1 == 'AWKWARD' or p2 == 'AWKWARD':
                score = 100   # ペナルティ（同じ車は避ける）
            elif p1 == 'WANT' or p2 == 'WANT':
                score = p_score  # 報酬（同じ車に乗せる）
            else:
                score = 0
            W[i][j] = score
            W[j][i] = score
    return W


# ==========================================
# Google Maps Distance Matrix API（キャッシュ付き）
# ==========================================
CACHE_FILE = 'distance_cache.json'
USAGE_FILE  = 'usage_stats.json'
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

    missing_p, missing_d = [], []
    for p in passenger_stations:
        for d in driver_stations:
            if f"{p}_{d}" not in cache:
                if p not in missing_p: missing_p.append(p)
                if d not in missing_d: missing_d.append(d)

    if missing_p and missing_d:
        requested = len(missing_p) * len(missing_d)
        if usage["total_elements"] + requested > MONTHLY_LIMIT:
            raise Exception("APIの月間使用上限に達しました。")

        kwargs = dict(
            origins=missing_p,
            destinations=missing_d,
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
            for d_idx, element in enumerate(row['elements']):
                key = f"{missing_p[p_idx]}_{missing_d[d_idx]}"
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
    W: List[List[int]],
    fixstars_key: str
) -> dict:
    from amplify import VariableGenerator, Model, solve, equal_to, less_equal
    from amplify.client import FixstarsClient

    num_people = len(passengers)
    num_cars   = len(drivers)
    C = [(d.capacity or 4) for d in drivers]

    alpha    = 1.0
    beta     = 1.0
    lambda_1 = 5000.0
    lambda_2 = 5000.0

    gen = VariableGenerator()
    x = gen.array("Binary", (num_people, num_cars))

    from amplify import sum as asum
    distance_cost      = asum(d_matrix[i][k] * x[i, k] for i in range(num_people) for k in range(num_cars))
    relation_cost      = asum(W[i][j] * x[i, k] * x[j, k] for i in range(num_people) for j in range(i+1, num_people) for k in range(num_cars))
    objective          = alpha * distance_cost + beta * relation_cost

    one_hot_constraints  = [equal_to(asum(x[i, k] for k in range(num_cars)), 1) for i in range(num_people)]
    capacity_constraints = [less_equal(asum(x[i, k] for i in range(num_people)), C[k] - 1) for k in range(num_cars)]
    constraints = asum(c * lambda_1 for c in one_hot_constraints) + asum(c * lambda_2 for c in capacity_constraints)

    model = Model(objective, constraints)
    client = FixstarsClient()
    client.token = fixstars_key
    client.parameters.timeout = 1500

    result = solve(model, client)
    if len(result) == 0:
        return {"error": "Amplifyで解が見つかりませんでした。制約が矛盾している可能性があります。"}

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
# （移動時間最小 + 人間関係ペナルティ考慮）
# ==========================================
def run_greedy_assignment(
    passengers: List[Member],
    drivers: List[Member],
    d_matrix: List[List[int]],
    W: List[List[int]]
) -> dict:
    num_people = len(passengers)
    num_cars   = len(drivers)
    C = [(d.capacity or 4) for d in drivers]

    assignment = [-1] * num_people  # assignment[i] = 車のインデックス
    car_counts = [0] * num_cars

    # 各乗客を、スコアが最小の車に貪欲に割り当て
    for i in range(num_people):
        best_car = -1
        best_score = float('inf')
        for k in range(num_cars):
            if car_counts[k] >= C[k] - 1:
                continue  # 定員オーバー
            # 移動時間コスト
            score = d_matrix[i][k]
            # すでに割り当てられた乗客との人間関係コスト
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
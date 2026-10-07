import time
import random
import sqlite3

from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

from .db import get_db
from .game import Match3Game
from .services import (
    metrics_from_sessions,
    ml,
    adaptive_difficulty,
    explain_adjustment,
    skill_radar,
    knowledge_level
)


api = Blueprint("api", __name__)

# Stores currently running games
GAME_CACHE = {}


@api.post("/register")
def register():

    data = request.get_json() or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username:
        return jsonify({
            "error": "Username is required"
        }), 400

    if len(password) < 4:
        return jsonify({
            "error": "Password must be at least 4 characters"
        }), 400

    db = get_db()

    try:

        cursor = db.execute(
            """
            INSERT INTO players(username, password_hash)
            VALUES (?, ?)
            """,
            (
                username,
                generate_password_hash(password)
            )
        )

        db.commit()

        # Store login session
        session["player_id"] = cursor.lastrowid
        session["username"] = username

        return jsonify({
            "ok": True,
            "username": username
        })

    except sqlite3.IntegrityError:

        return jsonify({
            "error": "Username already exists"
        }), 409

    finally:

        db.close()


@api.post("/login")
def login():

    data = request.get_json() or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    db = get_db()

    row = db.execute(
        """
        SELECT *
        FROM players
        WHERE username = ?
        """,
        (username,)
    ).fetchone()

    db.close()

    if (
        not row
        or not check_password_hash(
            row["password_hash"],
            password
        )
    ):
        return jsonify({
            "error": "Invalid credentials"
        }), 401

    session["player_id"] = row["id"]
    session["username"] = row["username"]

    return jsonify({
        "ok": True,
        "username": row["username"]
    })


@api.post("/logout")
def logout():

    session.clear()

    return jsonify({
        "ok": True
    })


@api.get("/me")
def me():

    return jsonify({
        "logged_in": "player_id" in session,
        "username": session.get("username"),
        "player_id": session.get("player_id")
    })




def require_user():

    player_id = session.get("player_id")

    if not player_id:
        return None

    return int(player_id)


def player_metrics(player_id):

    db = get_db()

    rows = db.execute(
        """
        SELECT *
        FROM sessions
        WHERE player_id = ?
        ORDER BY id DESC
        LIMIT 30
        """,
        (player_id,)
    ).fetchall()

    db.close()

    return metrics_from_sessions(rows)


@api.post("/game/new")
def new_game():

    player_id = require_user()

    if not player_id:

        return jsonify({
            "error": "Login required"
        }), 401

    data = request.get_json() or {}

    try:
        current_difficulty = float(
            data.get("difficulty", 0.5)
        )
    except (TypeError, ValueError):
        current_difficulty = 0.5

    # Get player's historical metrics
    metrics = player_metrics(player_id)

    # ML prediction
    prediction = ml.predict(metrics)

    # Adaptive difficulty
    difficulty, delta = adaptive_difficulty(
        current_difficulty,
        prediction
    )

    # Unique game ID
    game_id = (
        f"{player_id}-"
        f"{int(time.time() * 1000)}"
    )

    # Create game
    game = Match3Game(
        difficulty,
        seed=random.randint(
            1,
            10**9
        )
    )

    GAME_CACHE[game_id] = {

        "game": game,

        "started": time.time(),

        "difficulty": difficulty,

        "player_id": player_id
    }

    return jsonify({

        "game_id": game_id,

        "state": game.state(),

        "prediction": prediction,

        "explanation": explain_adjustment(
            delta,
            prediction
        )
    })



@api.post("/game/move")
def move():

    player_id = require_user()

    if not player_id:

        return jsonify({
            "error": "Login required"
        }), 401

    data = request.get_json() or {}

    game_id = data.get(
        "game_id",
        ""
    )

    item = GAME_CACHE.get(game_id)

    if (
        not item
        or item["player_id"] != player_id
    ):

        return jsonify({
            "error": "Game not found"
        }), 404

    try:

        from_position = tuple(
            data["from"]
        )

        to_position = tuple(
            data["to"]
        )

    except (KeyError, TypeError, ValueError):

        return jsonify({
            "error": "Invalid move data"
        }), 400

    result = item["game"].swap(
        (
            from_position,
            to_position
        )
    )

    game = item["game"]

    won = (
        game.score >=
        game.target_score
    )

    over = (
        won
        or game.moves >= game.moves_limit
    )

    # Save finished game
    if over:

        _save_session(
            item,
            won
        )

    return jsonify({

        "result": result,

        "state": game.state(),

        "won": won,

        "over": over
    })



@api.get("/game/hint")
def hint():

    player_id = require_user()

    if not player_id:

        return jsonify({
            "error": "Login required"
        }), 401

    game_id = request.args.get(
        "game_id",
        ""
    )

    item = GAME_CACHE.get(game_id)

    if (
        not item
        or item["player_id"] != player_id
    ):

        return jsonify({
            "error": "Game not found"
        }), 404

    ranked = item["game"].best_move_ranked(limit=3)
    move = ranked[0]["move"] if ranked else None

    # Count hint usage
    item["game"].hints_used += 1

    reason = (
        "A* / heuristic search evaluated every legal adjacent swap and "
        "selected the one that creates the largest immediate match "
        f"({ranked[0]['match_size']} tiles)." if ranked else
        "No legal move currently creates a match."
    )

    if move:
        db = get_db()
        db.execute(
            """
            INSERT INTO hints_log(
                player_id, game_id, from_r, from_c, to_r, to_c, reasoning
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                player_id,
                game_id,
                move[0][0], move[0][1],
                move[1][0], move[1][1],
                reason
            )
        )
        db.commit()
        db.close()

    return jsonify({

        "move": move,

        "reason": reason,

        "alternatives": ranked
    })

def _save_session(item, won):

    game = item["game"]

    elapsed_time = (
        time.time() -
        item["started"]
    )

    db = get_db()

    db.execute(
        """
        INSERT INTO sessions(
            player_id,
            level,
            score,
            moves,
            time_seconds,
            hints_used,
            won,
            difficulty,
            board_seed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            item["player_id"],
            1,
            game.score,
            game.moves,
            elapsed_time,
            game.hints_used,
            int(won),
            item["difficulty"],
            0
        )
    )

    db.commit()

    db.close()


@api.get("/analytics")
def analytics():

    player_id = require_user()

    if not player_id:

        return jsonify({
            "error": "Login required"
        }), 401

    db = get_db()

    rows = db.execute(
        """
        SELECT *
        FROM sessions
        WHERE player_id = ?
        ORDER BY created_at DESC
        LIMIT 50
        """,
        (player_id,)
    ).fetchall()

    db.close()

    # Calculate metrics
    metrics = metrics_from_sessions(
        rows
    )

    # ML prediction
    prediction = ml.predict(
        metrics
    )

    # Explainable AI
    explanation = ml.shap_explanation(
        metrics
    )

    return jsonify({

        "metrics": metrics,

        "prediction": prediction,

        "explanation": explanation,

        "sessions": [
            dict(row)
            for row in rows
        ]
    })



@api.get("/dashboard")
def dashboard():

    db = get_db()

    summary = db.execute(
        """
        SELECT
            COUNT(*) AS games,
            SUM(won) AS wins,
            AVG(score) AS avg_score,
            AVG(time_seconds) AS avg_time
        FROM sessions
        """
    ).fetchone()

    by_difficulty = db.execute(
        """
        SELECT
            ROUND(difficulty, 1) AS difficulty,
            COUNT(*) AS games,
            AVG(score) AS avg_score,
            AVG(won) AS win_rate
        FROM sessions
        GROUP BY ROUND(difficulty, 1)
        ORDER BY difficulty
        """
    ).fetchall()

    db.close()

    return jsonify({

        "summary": dict(
            summary or {}
        ),

        "difficulty": [
            dict(row)
            for row in by_difficulty
        ]
    })


@api.get("/analytics/game")
def analytics_game():
    """Data for the Game Analytics dashboard: level/score/moves history + trends."""

    player_id = require_user()

    if not player_id:
        return jsonify({"error": "Login required"}), 401

    db = get_db()

    rows = db.execute(
        """
        SELECT *
        FROM sessions
        WHERE player_id = ?
        ORDER BY id ASC
        LIMIT 100
        """,
        (player_id,)
    ).fetchall()

    db.close()

    sessions = [dict(r) for r in rows]
    n = len(sessions)

    summary = {
        "total_games": n,
        "wins": sum(1 for s in sessions if s["won"]),
        "losses": sum(1 for s in sessions if not s["won"]),
        "best_score": max((s["score"] or 0 for s in sessions), default=0),
        "avg_score": round(sum((s["score"] or 0) for s in sessions) / n, 1) if n else 0,
        "avg_moves": round(sum((s["moves"] or 0) for s in sessions) / n, 1) if n else 0,
        "avg_time": round(sum((s["time_seconds"] or 0) for s in sessions) / n, 1) if n else 0,
        "total_hints": sum((s["hints_used"] or 0) for s in sessions),
    }

    trend = [
        {
            "game_no": i + 1,
            "level": s["level"],
            "score": s["score"],
            "moves": s["moves"],
            "time_seconds": round(s["time_seconds"] or 0, 1),
            "difficulty": round(s["difficulty"] or 0, 2),
            "won": bool(s["won"]),
        }
        for i, s in enumerate(sessions)
    ]

    return jsonify({"summary": summary, "trend": trend})


@api.get("/analytics/player")
def analytics_player():
    """Data for the Player Analytics dashboard: difficulty, knowledge tier, skill radar."""

    player_id = require_user()

    if not player_id:
        return jsonify({"error": "Login required"}), 401

    metrics = player_metrics(player_id)
    prediction = ml.predict(metrics)

    db = get_db()

    rows = db.execute(
        """
        SELECT difficulty, won, created_at
        FROM sessions
        WHERE player_id = ?
        ORDER BY id ASC
        LIMIT 100
        """,
        (player_id,)
    ).fetchall()

    db.close()

    difficulty_trend = [
        {
            "game_no": i + 1,
            "difficulty": round(r["difficulty"] or 0, 2),
            "won": bool(r["won"])
        }
        for i, r in enumerate(rows)
    ]

    cluster_labels = ["Cautious Explorer", "Balanced Strategist", "Aggressive Optimizer"]
    cluster = prediction.get("behavior_cluster", 0)

    return jsonify({
        "metrics": metrics,
        "prediction": prediction,
        "radar": skill_radar(metrics),
        "knowledge_level": knowledge_level(prediction, metrics),
        "behavior_label": cluster_labels[cluster] if 0 <= cluster < len(cluster_labels) else "Unclassified",
        "difficulty_trend": difficulty_trend
    })


@api.get("/analytics/hint_sample")
def analytics_hint_sample():
    """A live, throwaway sample board + AI recommendation for the AI Hint dashboard
    demo panel. Not tied to any real game session and never logged."""

    player_id = require_user()

    if not player_id:
        return jsonify({"error": "Login required"}), 401

    from .game import Match3Game

    sample = Match3Game(difficulty=0.5)
    ranked = sample.best_move_ranked(limit=3)
    move = ranked[0]["move"] if ranked else None

    reason = (
        "The search evaluates every legal adjacent swap on the board below and "
        f"picks the one creating the largest immediate match ({ranked[0]['match_size']} tiles), "
        "the same logic used for in-game hints."
        if ranked else "No legal move currently creates a match on this sample board."
    )

    return jsonify({
        "board": sample.board,
        "move": move,
        "reason": reason,
        "alternatives": ranked
    })


@api.get("/analytics/hints")
def analytics_hints():
    """Data for the AI Hint dashboard: hint history + effectiveness."""

    player_id = require_user()

    if not player_id:
        return jsonify({"error": "Login required"}), 401

    db = get_db()

    hint_rows = db.execute(
        """
        SELECT *
        FROM hints_log
        WHERE player_id = ?
        ORDER BY id DESC
        LIMIT 25
        """,
        (player_id,)
    ).fetchall()

    session_rows = db.execute(
        """
        SELECT hints_used, moves, score, won
        FROM sessions
        WHERE player_id = ?
        ORDER BY id ASC
        LIMIT 100
        """,
        (player_id,)
    ).fetchall()

    db.close()

    n = len(session_rows)
    total_hints = sum((r["hints_used"] or 0) for r in session_rows)

    summary = {
        "total_hints_used": total_hints,
        "avg_hints_per_game": round(total_hints / n, 2) if n else 0,
        "hint_reliance_pct": round(
            100 * sum(1 for r in session_rows if (r["hints_used"] or 0) > 0) / n, 1
        ) if n else 0,
        "win_rate_with_hints": round(
            100 * sum(1 for r in session_rows if r["won"] and (r["hints_used"] or 0) > 0)
            / max(1, sum(1 for r in session_rows if (r["hints_used"] or 0) > 0)), 1
        ),
        "win_rate_without_hints": round(
            100 * sum(1 for r in session_rows if r["won"] and (r["hints_used"] or 0) == 0)
            / max(1, sum(1 for r in session_rows if (r["hints_used"] or 0) == 0)), 1
        ),
    }

    hints_trend = [
        {"game_no": i + 1, "hints_used": r["hints_used"] or 0}
        for i, r in enumerate(session_rows)
    ]

    history = [dict(r) for r in hint_rows]

    return jsonify({
        "summary": summary,
        "hints_trend": hints_trend,
        "history": history
    })


@api.post("/abtest")
def abtest():

    player_id = require_user()

    if not player_id:

        return jsonify({
            "error": "Login required"
        }), 401

    data = request.get_json() or {}

    variant = data.get(
        "variant",
        "A"
    )

    try:

        reward = float(
            data.get(
                "reward",
                0
            )
        )

    except (TypeError, ValueError):

        reward = 0.0

    db = get_db()

    db.execute(
        """
        INSERT INTO ab_events(
            player_id,
            variant,
            reward
        )
        VALUES (?, ?, ?)
        """,
        (
            player_id,
            variant,
            reward
        )
    )

    db.commit()

    rows = db.execute(
        """
        SELECT
            variant,
            AVG(reward) AS avg_reward,
            COUNT(*) AS n
        FROM ab_events
        GROUP BY variant
        """
    ).fetchall()

    db.close()

    return jsonify({

        "results": [
            dict(row)
            for row in rows
        ]
    })
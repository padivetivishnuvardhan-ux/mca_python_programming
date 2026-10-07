import math
from collections import Counter
from .ml import MLManager, QLearningAgent

ml = MLManager()
rl = QLearningAgent()


def metrics_from_sessions(rows):
    if not rows:
        return {'avg_thinking_time':.5,'move_efficiency':.5,'mistake_rate':.2,'hint_rate':.1,'completion_rate':.5,'session_duration':.5,'avg_score':.5}
    n = len(rows)
    moves = [max(1, r['moves'] or 1) for r in rows]
    target = [max(1, r['score'] or 1) for r in rows]
    return {
        'avg_thinking_time': min(1.0, sum((r['time_seconds'] or 0)/60 for r in rows)/(n*3)),
        'move_efficiency': min(1.0, sum((r['score'] or 0)/max(1,(r['moves'] or 1)*50) for r in rows)/n),
        'mistake_rate': min(1.0, sum(1-(r['won'] or 0) for r in rows)/n),
        'hint_rate': min(1.0, sum((r['hints_used'] or 0)/max(1,(r['moves'] or 1)) for r in rows)/n),
        'completion_rate': sum(1 if r['won'] else 0 for r in rows)/n,
        'session_duration': min(1.0, sum((r['time_seconds'] or 0)/300 for r in rows)/n),
        'avg_score': min(1.0, sum((r['score'] or 0)/1500 for r in rows)/n)
    }


def adaptive_difficulty(current, prediction):
    delta = rl.choose(prediction)
    return round(max(0.1, min(0.95, current + delta)), 2), delta


def explain_adjustment(delta, prediction):
    if delta < 0: return 'Difficulty reduced because predicted success is low and recent performance suggests the level may be too challenging.'
    if delta > 0: return 'Difficulty increased because predicted success is high and recent performance suggests the level may be too easy.'
    return 'Difficulty kept balanced because predicted success is in the target challenge range.'


def skill_radar(metrics):
    """Translate raw normalized metrics (0-1) into human-readable 0-100
    skill scores for the player-analytics radar chart."""
    accuracy = 100 * (1 - metrics.get('mistake_rate', 0.2))
    speed = 100 * (1 - metrics.get('avg_thinking_time', 0.5))
    efficiency = 100 * metrics.get('move_efficiency', 0.5)
    persistence = 100 * metrics.get('completion_rate', 0.5)
    independence = 100 * (1 - metrics.get('hint_rate', 0.1))
    mastery = 100 * metrics.get('avg_score', 0.5)
    return {
        'accuracy': round(max(0, min(100, accuracy)), 1),
        'speed': round(max(0, min(100, speed)), 1),
        'efficiency': round(max(0, min(100, efficiency)), 1),
        'persistence': round(max(0, min(100, persistence)), 1),
        'independence': round(max(0, min(100, independence)), 1),
        'mastery': round(max(0, min(100, mastery)), 1),
    }


def knowledge_level(prediction, metrics):
    """A friendly label for the player's current mastery / knowledge tier."""
    p = prediction.get('success_probability', 0.5)
    completion = metrics.get('completion_rate', 0.5)
    score = (p * 0.6) + (completion * 0.4)
    if score >= 0.75: return 'Expert'
    if score >= 0.55: return 'Advanced'
    if score >= 0.35: return 'Intermediate'
    return 'Beginner'

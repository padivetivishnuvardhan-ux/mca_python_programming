# AI-Powered Intelligent Match-3 Puzzle Game

A runnable MCA-style web project based on the supplied project proposal and architecture.

## Stack
- Frontend: HTML5, CSS3, JavaScript
- Backend: Python Flask
- Database: SQLite
- ML: scikit-learn
- Explainability: SHAP-style factor explanation (lightweight request-time implementation)
- Search / optimization: A* / heuristic best-move selection
- Adaptive gameplay: Q-Learning controller
- Analytics: Random Forest, K-Means, Decision Tree, A/B testing endpoint

## Modules covered
1. User Management
2. Game Engine (match detection, scoring, level state)
3. AI Hint Generator
4. Adaptive Difficulty Engine
5. Player Behavior Analytics
6. Explainable AI
7. Analytics Dashboard/API

These map to the supplied architecture: Authentication -> Game Engine -> Player Behavior/Game State -> AI Decision Engine -> Reinforcement Learning -> Explainable AI -> Dashboard.

## Run
```bash
python -m venv venv
# Windows
venv\\Scripts\\activate
# Linux/macOS
source venv/bin/activate
pip install -r requirements.txt
python run.py
```
Open http://127.0.0.1:5000

## Project structure
```text
match3_ai_project/
  app/
    __init__.py
    db.py
    game.py
    ml.py
    routes.py
    services.py
  static/css/style.css
  static/js/app.js
  templates/index.html
  data/
  models/
  requirements.txt
  config.py
  run.py
```

## Notes
The ML models are initialized with synthetic bootstrapping data so the application runs immediately. After gameplay logs accumulate, replace `app/ml.py` training data with the project's collected dataset and retrain the models.

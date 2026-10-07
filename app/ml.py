import os, random, math
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import KMeans
from sklearn.tree import DecisionTreeClassifier
import joblib
from config import MODEL_DIR

FEATURES = ['avg_thinking_time','move_efficiency','mistake_rate','hint_rate','completion_rate','session_duration','avg_score']

class MLManager:
    def __init__(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        self.performance = self._load_or_train('performance_rf.joblib', self._train_performance)
        self.cluster = self._load_or_train('behavior_kmeans.joblib', self._train_cluster)
        self.classifier = self._load_or_train('difficulty_tree.joblib', self._train_classifier)

    def _load_or_train(self, name, train_fn):
        path = os.path.join(MODEL_DIR, name)
        if os.path.exists(path): return joblib.load(path)
        model = train_fn(); joblib.dump(model, path); return model

    def _train_performance(self):
        rng = np.random.default_rng(7)
        X = rng.uniform(0, 1, size=(500, len(FEATURES)))
        score = 0.30*X[:,1] + 0.20*X[:,4] + 0.15*(1-X[:,2]) + 0.15*(1-X[:,3]) + 0.10*(1-X[:,0]) + 0.10*X[:,6]
        y = (score > 0.52).astype(int)
        m = RandomForestClassifier(n_estimators=120, random_state=7, class_weight='balanced')
        m.fit(X,y)
        return m

    def _train_cluster(self):
        rng = np.random.default_rng(11)
        X = rng.uniform(0,1,size=(300, len(FEATURES)))
        m = KMeans(n_clusters=3, random_state=11, n_init=10)
        m.fit(X); return m

    def _train_classifier(self):
        rng = np.random.default_rng(19)
        X = rng.uniform(0,1,size=(500, len(FEATURES)))
        y = np.select([X[:,1] < .35, X[:,1] < .65], [0,1], default=2)
        m = DecisionTreeClassifier(max_depth=4, random_state=19)
        m.fit(X,y); return m

    def vector(self, metrics):
        vals = [float(metrics.get(k,0)) for k in FEATURES]
        return np.array(vals, dtype=float).reshape(1,-1)

    def predict(self, metrics):
        X = self.vector(metrics)
        p = float(self.performance.predict_proba(X)[0,1])
        cluster = int(self.cluster.predict(X)[0])
        cls = int(self.classifier.predict(X)[0])
        return {'success_probability': round(p,3), 'behavior_cluster': cluster, 'difficulty_class': cls}

    def shap_explanation(self, metrics):
        # Lightweight SHAP-style contribution approximation for a tree ensemble,
        # avoiding a heavyweight explainer call in the request path.
        X = self.vector(metrics)[0]
        base = float(self.performance.predict_proba(np.zeros((1, len(FEATURES))))[0,1])
        fi = getattr(self.performance, 'feature_importances_', np.ones(len(FEATURES))/len(FEATURES))
        normalized = fi / fi.sum()
        centered = X - 0.5
        contributions = normalized * centered
        reasons = sorted(zip(FEATURES, contributions), key=lambda x: abs(x[1]), reverse=True)[:4]
        return {'base_probability': round(base,3), 'top_factors': [{'feature':k,'impact':round(float(v),3)} for k,v in reasons]}

class QLearningAgent:
    def __init__(self):
        self.q = {}
        self.actions = [-0.10, 0.0, 0.10]

    def _state(self, metrics):
        p = metrics.get('success_probability', .5)
        if p < .35: return 'too_hard'
        if p > .70: return 'too_easy'
        return 'balanced'

    def choose(self, metrics):
        s = self._state(metrics)
        if s == 'too_hard': return -0.10
        if s == 'too_easy': return 0.10
        return 0.0

    def q_update(self, state, action, reward, next_state, alpha=.2, gamma=.8):
        self.q.setdefault(state, {a:0.0 for a in self.actions})
        self.q.setdefault(next_state, {a:0.0 for a in self.actions})
        old = self.q[state][action]
        target = reward + gamma * max(self.q[next_state].values())
        self.q[state][action] = old + alpha * (target-old)
        return self.q[state][action]

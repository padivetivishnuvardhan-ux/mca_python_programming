import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'data', 'match3.sqlite3')
MODEL_DIR = os.path.join(BASE_DIR, 'models')
SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-me')

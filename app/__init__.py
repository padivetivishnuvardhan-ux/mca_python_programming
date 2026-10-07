from flask import Flask, render_template, redirect
from flask_cors import CORS

from config import SECRET_KEY
from .db import init_db


def create_app():

    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
        static_url_path="/static"
    )

    app.secret_key = SECRET_KEY

    CORS(app)

    init_db()

    @app.route("/")
    def index():
        return redirect("/login")

    @app.route("/login")
    def login_page():
        return render_template("login.html")

    @app.route("/game")
    def game_page():
        return render_template("game.html")

    @app.route("/account")
    def account_page():
        return redirect("/dashboard/player")

    @app.route("/dashboard/game")
    def dashboard_game_page():
        return render_template("dashboard_game.html")

    @app.route("/dashboard/player")
    def dashboard_player_page():
        return render_template("dashboard_player.html")

    @app.route("/dashboard/hints")
    def dashboard_hints_page():
        return render_template("dashboard_hints.html")

    from .routes import api

    app.register_blueprint(
        api,
        url_prefix="/api"
    )

    return app
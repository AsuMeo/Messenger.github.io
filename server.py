#!/usr/bin/env python3
"""Flask API сервер для компиляции Java → APK."""
import os
import sys
import tempfile
import shutil
import time
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from build_apk import build_apk

app = Flask(__name__)
CORS(app)

# Директория для хранения готовых APK
OUTPUT_DIR = "/tmp/apk_outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Очистка старых файлов
MAX_AGE = 3600  # 1 час


def cleanup_old_files():
    """Удаляет APK старше 1 часа."""
    now = time.time()
    for f in os.listdir(OUTPUT_DIR):
        path = os.path.join(OUTPUT_DIR, f)
        if os.path.isfile(path) and now - os.path.getmtime(path) > MAX_AGE:
            os.remove(path)


@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "service": "Java → APK Compiler",
        "endpoints": ["/build (POST)"]
    })


@app.route("/build", methods=["POST"])
def build():
    """Принимает Java код и возвращает APK."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON data"}), 400

        app_name = data.get("appName", "MyApp").strip()
        package_name = data.get("packageName", "com.example.myapp").strip()
        min_sdk = int(data.get("minSdk", 26))
        java_code = data.get("javaCode", "").strip()

        if not java_code:
            return jsonify({"success": False, "error": "Java code is empty"}), 400

        # Очистка старых файлов
        cleanup_old_files()

        # Создаём временную директорию
        with tempfile.TemporaryDirectory() as work_dir:
            result = build_apk(app_name, package_name, min_sdk, java_code, work_dir)

            if result["success"]:
                # Копируем APK в постоянное хранилище
                apk_name = f"{app_name.replace(' ', '_')}_{int(time.time())}.apk"
                output_path = os.path.join(OUTPUT_DIR, apk_name)
                shutil.copy(result["apk_path"], output_path)

                # URL для скачивания
                download_url = f"/download/{apk_name}"

                return jsonify({
                    "success": True,
                    "appName": app_name,
                    "downloadUrl": request.host_url.rstrip("/") + download_url,
                    "logs": result["logs"]
                })
            else:
                return jsonify({
                    "success": False,
                    "error": result.get("error", "Unknown error"),
                    "logs": result.get("logs", [])
                }), 500

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "logs": [f"Server error: {str(e)}"]
        }), 500


@app.route("/download/<filename>")
def download(filename):
    """Скачивание APK файла."""
    path = os.path.join(OUTPUT_DIR, filename)
    if os.path.exists(path):
        return send_file(path, as_attachment=True, download_name=filename)
    return jsonify({"error": "File not found"}), 404


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)

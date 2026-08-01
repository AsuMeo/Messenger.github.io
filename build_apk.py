#!/usr/bin/env python3
"""Скрипт сборки APK из Java кода."""
import os
import subprocess
import shutil
import tempfile
import zipfile
import hashlib
import time

ANDROID_HOME = os.environ.get("ANDROID_HOME", "/opt/android-sdk")
BUILD_TOOLS = os.path.join(ANDROID_HOME, "build-tools", "34.0.0")
PLATFORM = os.path.join(ANDROID_HOME, "platforms", "android-34")


def build_apk(app_name, package_name, min_sdk, java_code, work_dir):
    """Собирает APK из Java кода."""
    logs = []

    def log(msg):
        logs.append(msg)
        print(msg)

    try:
        # Создаём структуру проекта
        src_dir = os.path.join(work_dir, "src", *package_name.split("."))
        os.makedirs(src_dir, exist_ok=True)

        res_dir = os.path.join(work_dir, "res")
        os.makedirs(os.path.join(res_dir, "values"), exist_ok=True)
        os.makedirs(os.path.join(res_dir, "layout"), exist_ok=True)

        lib_dir = os.path.join(work_dir, "lib")
        os.makedirs(lib_dir, exist_ok=True)

        # Пишем Java код
        main_java = os.path.join(src_dir, "MainActivity.java")
        with open(main_java, "w", encoding="utf-8") as f:
            f.write(java_code)
        log(f"✓ MainActivity.java создан")

        # Создаём AndroidManifest.xml
        manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="{package_name}"
    android:versionCode="1"
    android:versionName="1.0">
    <uses-sdk android:minSdkVersion="{min_sdk}" android:targetSdkVersion="34" />
    <application
        android:label="{app_name}"
        android:theme="@android:style/Theme.Light.NoActionBar">
        <activity android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>"""

        manifest_path = os.path.join(work_dir, "AndroidManifest.xml")
        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write(manifest)
        log("✓ AndroidManifest.xml создан")

        # Создаём strings.xml
        strings_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">{app_name}</string>
</resources>"""
        with open(os.path.join(res_dir, "values", "strings.xml"), "w", encoding="utf-8") as f:
            f.write(strings_xml)

        # Создаём пустой layout
        layout_xml = """<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />"""
        with open(os.path.join(res_dir, "layout", "main.xml"), "w", encoding="utf-8") as f:
            f.write(layout_xml)

        # Компиляция ресурсов через aapt2
        log("🔨 Компиляция ресурсов...")
        compiled_res = os.path.join(work_dir, "compiled_res.zip")
        aapt2 = os.path.join(BUILD_TOOLS, "aapt2")

        res_files = []
        for root, _, files in os.walk(res_dir):
            for file in files:
                res_files.append(os.path.join(root, file))

        if res_files:
            compile_args = [aapt2, "compile", "--dir", res_dir, "-o", compiled_res]
            r = subprocess.run(compile_args, capture_output=True, text=True)
            if r.returncode != 0 and r.stderr:
                log(f"⚠ aapt2 compile: {r.stderr[:200]}")

        # Линковка ресурсов
        log("🔗 Линковка ресурсов...")
        r_java_dir = os.path.join(work_dir, "r_java")
        os.makedirs(r_java_dir, exist_ok=True)

        link_args = [
            aapt2, "link",
            "-I", os.path.join(PLATFORM, "android.jar"),
            "--manifest", manifest_path,
            "-o", os.path.join(work_dir, "resources.ap_"),
            "--java", r_java_dir,
            "--min-sdk-version", str(min_sdk),
            "--target-sdk-version", "34",
            "--version-code", "1",
            "--version-name", "1.0"
        ]

        if os.path.exists(compiled_res):
            link_args.extend(["-R", compiled_res])

        r = subprocess.run(link_args, capture_output=True, text=True)
        if r.returncode != 0:
            log(f"❌ aapt2 link ошибка: {r.stderr[:500]}")
            return {"success": False, "error": r.stderr[:500], "logs": logs}
        log("✓ Ресурсы скомпилированы")

        # Компиляция Java
        log("☕ Компиляция Java...")
        classes_dir = os.path.join(work_dir, "classes")
        os.makedirs(classes_dir, exist_ok=True)

        java_files = []
        for root, _, files in os.walk(src_dir):
            for file in files:
                if file.endswith(".java"):
                    java_files.append(os.path.join(root, file))

        # Добавляем R.java если есть
        for root, _, files in os.walk(r_java_dir):
            for file in files:
                if file.endswith(".java"):
                    java_files.append(os.path.join(root, file))

        javac = os.path.join(os.environ.get("JAVA_HOME", "/usr/lib/jvm/java-17-openjdk-amd64"), "bin", "javac")

        classpath = os.path.join(PLATFORM, "android.jar")

        compile_cmd = [javac, "-source", "1.8", "-target", "1.8", "-cp", classpath, "-d", classes_dir] + java_files
        r = subprocess.run(compile_cmd, capture_output=True, text=True)
        if r.returncode != 0:
            log(f"❌ javac ошибка: {r.stderr[:500]}")
            return {"success": False, "error": r.stderr[:500], "logs": logs}
        log("✓ Java скомпилирован")

        # Конвертация в Dalvik байткод через d8
        log("🔄 Конвертация в Dalvik...")
        dex_output = os.path.join(work_dir, "classes.dex")

        d8 = os.path.join(BUILD_TOOLS, "d8")

        class_files = []
        for root, _, files in os.walk(classes_dir):
            for file in files:
                if file.endswith(".class"):
                    class_files.append(os.path.join(root, file))

        d8_cmd = [d8, "--release", "--output", work_dir, "--lib", classpath] + class_files
        r = subprocess.run(d8_cmd, capture_output=True, text=True)
        if r.returncode != 0:
            log(f"❌ d8 ошибка: {r.stderr[:500]}")
            return {"success": False, "error": r.stderr[:500], "logs": logs}
        log("✓ Dalvik байткод создан")

        # Сборка APK
        log("📦 Сборка APK...")
        unsigned_apk = os.path.join(work_dir, f"{app_name}_unsigned.apk")

        # Копируем resources.ap_ и добавляем classes.dex
        shutil.copy(os.path.join(work_dir, "resources.ap_"), unsigned_apk)

        with zipfile.ZipFile(unsigned_apk, "a", zipfile.ZIP_DEFLATED) as zf:
            dex_path = os.path.join(work_dir, "classes.dex")
            if os.path.exists(dex_path):
                zf.write(dex_path, "classes.dex")
        log("✓ APK собран")

        # Подпись APK
        log("🔐 Подпись APK...")
        keystore = os.path.join(work_dir, "debug.keystore")
        keytool = os.path.join(os.environ.get("JAVA_HOME", "/usr/lib/jvm/java-17-openjdk-amd64"), "bin", "keytool")

        # Создаём debug keystore
        subprocess.run([
            keytool, "-genkey", "-v",
            "-keystore", keystore,
            "-alias", "androiddebugkey",
            "-storepass", "android",
            "-keypass", "android",
            "-keyalg", "RSA",
            "-validity", "10000",
            "-dname", "CN=Android Debug,O=Android,C=US"
        ], capture_output=True)

        # Подписываем
        apksigner = os.path.join(BUILD_TOOLS, "apksigner")
        signed_apk = os.path.join(work_dir, f"{app_name}.apk")

        sign_cmd = [
            apksigner, "sign",
            "--ks", keystore,
            "--ks-pass", "pass:android",
            "--key-pass", "pass:android",
            "--out", signed_apk,
            unsigned_apk
        ]
        r = subprocess.run(sign_cmd, capture_output=True, text=True)
        if r.returncode != 0:
            log(f"❌ Подпись ошибка: {r.stderr[:500]}")
            # Если apksigner не работает, используем jarsigner
            jarsigner = os.path.join(os.environ.get("JAVA_HOME", "/usr/lib/jvm/java-17-openjdk-amd64"), "bin", "jarsigner")
            subprocess.run([
                jarsigner, "-verbose", "-sigalg", "SHA1withRSA", "-digestalg", "SHA1",
                "-keystore", keystore, "-storepass", "android",
                unsigned_apk, "androiddebugkey"
            ], capture_output=True)
            shutil.copy(unsigned_apk, signed_apk)

        # Align
        zipalign = os.path.join(BUILD_TOOLS, "zipalign")
        aligned_apk = os.path.join(work_dir, f"{app_name}_aligned.apk")

        r = subprocess.run([zipalign, "-f", "4", signed_apk, aligned_apk], capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(aligned_apk):
            final_apk = aligned_apk
        else:
            final_apk = signed_apk

        log("✓ APK подписан и готов!")

        return {
            "success": True,
            "apk_path": final_apk,
            "logs": logs
        }

    except Exception as e:
        log(f"❌ Исключение: {str(e)}")
        return {"success": False, "error": str(e), "logs": logs}


if __name__ == "__main__":
    # Тест
    code = """package com.example.test;
import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
public class MainActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        TextView tv = new TextView(this);
        tv.setText("Test");
        setContentView(tv);
    }
}"""

    with tempfile.TemporaryDirectory() as td:
        result = build_apk("TestApp", "com.example.test", 21, code, td)
        print(result)

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools"

# Установка зависимостей
RUN apt-get update && apt-get install -y     openjdk-17-jdk     wget     unzip     git     python3     python3-pip     nodejs     npm     && rm -rf /var/lib/apt/lists/*

# Установка Android SDK
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools &&     wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdline-tools.zip &&     unzip -q /tmp/cmdline-tools.zip -d ${ANDROID_HOME}/cmdline-tools &&     mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest &&     rm /tmp/cmdline-tools.zip

# Принимаем лицензии и ставим нужные пакеты
RUN yes | sdkmanager --licenses &&     sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34"

# Рабочая директория
WORKDIR /app

# Копируем сервер
COPY server.py /app/
COPY build_apk.py /app/

# Установка Python зависимостей
RUN pip3 install flask flask-cors gunicorn

# Порт
EXPOSE 10000

# Запуск
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:10000", "server:app"]

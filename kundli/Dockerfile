FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
# ffmpeg: social videos (media.py). The rest is the astrology engine.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt
COPY likha_kundli likha_kundli
COPY tools tools
COPY app.py media.py ./
# NASA JPL DE421 ships inside the skyfield-data package (1900-2050). Nothing else to download.
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]

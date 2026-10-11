FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "scikit-learn==1.8.0"

COPY app.py ml_model.py ./
COPY models ./models

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/')"

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]

FROM python:3.12-slim

# System deps for GeoDjango + psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin libgdal-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["./entrypoint.sh"]

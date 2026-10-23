FROM python:3.13-slim
WORKDIR /srv
COPY requirements.lock /srv/requirements.lock
RUN pip install --no-cache-dir -r requirements.lock && python -m playwright install --with-deps chromium
COPY . /srv/backend
RUN useradd --create-home --uid 10001 scamurai && mkdir -p /srv/backend/data && chown -R scamurai:scamurai /srv/backend/data /root/.cache/ms-playwright && cp -r /root/.cache/ms-playwright /opt/ms-playwright && chmod -R a+rX /opt/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright APP_ENV=production LOCAL_FIXTURES_ENABLED=false
USER scamurai
EXPOSE 8001
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--no-access-log"]

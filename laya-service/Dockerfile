# syntax=docker/dockerfile:1

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/hf \
    PORT=8080 \
    LAYA_DEVICE=cpu \
    LAYA_MODEL=multilingual

RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch

RUN pip install --no-cache-dir laya

RUN python -c "from laya import Router; Router(device='cpu', preload=True)" \
    && du -sh /opt/hf

RUN useradd --create-home --shell /usr/sbin/nologin laya \
    && chown -R laya:laya /opt/hf

COPY server.py /usr/local/bin/laya-service.py

USER laya
WORKDIR /home/laya

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=5).status==200 else 1)"

CMD ["python3", "/usr/local/bin/laya-service.py"]

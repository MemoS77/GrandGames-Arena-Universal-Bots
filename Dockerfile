FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    gnupg \
    python3 \
    python3-pip \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY python/requirements.txt /tmp/requirements.txt
COPY python/patch_pydraughts.py /tmp/patch_pydraughts.py
RUN pip3 install --break-system-packages -r /tmp/requirements.txt \
    && python3 /tmp/patch_pydraughts.py

WORKDIR /app
COPY dist ./dist
COPY python ./python
CMD ["node", "dist/bundle.js"]

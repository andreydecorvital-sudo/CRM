# Isolated Railway/Docker source root: infra/litellm
# Reviewed release tag example from LiteLLM docs. Pin digest for production.
FROM ghcr.io/berriai/litellm:v1.103.0

COPY config.example.yaml /app/shared-ai-config.yaml

EXPOSE 4000
CMD ["--config", "/app/shared-ai-config.yaml", "--port", "4000"]

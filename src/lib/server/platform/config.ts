export type PlatformReadiness = {
  aiGateway: {
    enabled: boolean
    baseUrlConfigured: boolean
    keyConfigured: boolean
    modelConfigured: boolean
  }
  posthog: {
    enabled: boolean
    hostConfigured: boolean
  }
  langfuse: {
    enabled: boolean
    baseUrlConfigured: boolean
    sampleRate: number
    contentCapture: boolean
  }
  supabase: {
    configured: boolean
    queues: "planned"
    cron: "planned"
    vector: "planned"
  }
}

function present(name: string) {
  return Boolean(String(process.env[name] || "").trim())
}

export function platformReadiness(): PlatformReadiness {
  const sample = Number(process.env.LANGFUSE_SAMPLE_RATE ?? 1)
  const sampleRate = Number.isFinite(sample) ? Math.min(Math.max(sample,0),1) : 1

  return {
    aiGateway: {
      enabled: present("AI_GATEWAY_BASE_URL")
        && present("AI_GATEWAY_API_KEY")
        && present("AI_GATEWAY_MODEL"),
      baseUrlConfigured: present("AI_GATEWAY_BASE_URL"),
      keyConfigured: present("AI_GATEWAY_API_KEY"),
      modelConfigured: present("AI_GATEWAY_MODEL"),
    },
    posthog: {
      enabled: present("POSTHOG_PROJECT_TOKEN"),
      hostConfigured: present("POSTHOG_HOST"),
    },
    langfuse: {
      enabled: present("LANGFUSE_PUBLIC_KEY") && present("LANGFUSE_SECRET_KEY"),
      baseUrlConfigured: present("LANGFUSE_BASE_URL"),
      sampleRate,
      contentCapture: String(process.env.LANGFUSE_CAPTURE_CONTENT || "").toLowerCase() === "true",
    },
    supabase: {
      configured: present("SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY"),
      queues: "planned",
      cron: "planned",
      vector: "planned",
    },
  }
}

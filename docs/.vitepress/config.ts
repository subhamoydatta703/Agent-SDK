import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Somoy',
  description: 'A transparent, hand-written AI Agent SDK for TypeScript.',
  lang: 'en-US',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/installation' },
      { text: 'Examples', link: '/examples/basic' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'API Reference', link: '/guide/api-reference' },
          { text: 'Tools', link: '/guide/tools' },
          { text: 'Providers', link: '/guide/providers' },
          { text: 'Handoffs', link: '/guide/handoffs' },
          { text: 'Guardrails', link: '/guide/guardrails' },
          { text: 'Sessions & Memory', link: '/guide/memory-sessions' },
          { text: 'Structured Output', link: '/guide/structured-output' },
          { text: 'Streaming & Events', link: '/guide/streaming-events' },
          { text: 'Tracing', link: '/guide/tracing' },
          { text: 'Error Handling', link: '/guide/error-handling' },
          { text: 'Reliability', link: '/guide/reliability' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Basic tool call', link: '/examples/basic' },
          { text: 'Handoff / triage router', link: '/examples/handoff-router' },
          { text: 'Provider: Mock', link: '/examples/provider-mock' },
          { text: 'Provider: Gemini', link: '/examples/provider-gemini' },
          { text: 'Provider: OpenAI', link: '/examples/provider-openai' },
        ],
      },
    ],
    footer: { message: 'MIT Licensed' },
  },
});
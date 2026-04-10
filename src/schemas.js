import { z } from 'zod';

// Schema per /v1/messages
export const MessageSchema = z.object({
  model: z.string().min(1, 'Model is required'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant'], {
      errorMap: () => ({ message: 'Role must be user or assistant' })
    }),
    content: z.union([
      z.string(),
      z.array(z.object({
        type: z.string(),
        text: z.string().optional(),
        name: z.string().optional(),
        input: z.any().optional(),
        tool_use_id: z.string().optional(),
        content: z.any().optional()
      }))
    ])
  })).min(1, 'At least one message is required'),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  system: z.union([z.string(), z.array(z.any())]).optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.any().optional(),
    type: z.string().optional()
  })).optional(),
  thinking: z.any().optional()
});

// Schema per /v1/messages/count_tokens
export const CountTokensSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.any()).optional(),
  system: z.union([z.string(), z.array(z.any())]).optional()
});

// Schema per il config
export const ConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(8788),
  upstreamBaseUrl: z.string().url().default('https://ollama.com'),
  apiKeys: z.array(z.string().min(1)).min(1, 'At least one API key is required'),
  aliases: z.record(z.string()).default({}),
  defaultModel: z.string().default('ollama-free-auto')
});

// Funzione helper per la validazione
export function validateInput(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues || error.errors || [];
      const formattedErrors = errors.map(err => ({
        field: err.path ? err.path.join('.') : 'unknown',
        message: err.message
      }));
      throw new Error(`Validation failed: ${formattedErrors.map(e => `${e.field}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

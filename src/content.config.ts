import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    category: z.string(),
    date: z.coerce.date(),
    excerpt: z.string().optional().default(''),
    draft: z.boolean().default(false),
  }),
});

const novels = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/novels' }),
  schema: z.object({
    title: z.string(),
    type: z.string().default('长篇小说'),
    status: z.string().default(''),
    year: z.string().default(''),
    cover: z.string().optional().default(''),
    summary: z.string().optional().default(''),
    draft: z.boolean().default(false),
  }),
});

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/chapters' }),
  schema: z.object({
    novel: z.string(),
    order: z.number().int().positive(),
    title: z.string(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles, novels, chapters };

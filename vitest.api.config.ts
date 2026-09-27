import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.smoke.ts'],environment:'node',hookTimeout:15000,testTimeout:10000,fileParallelism:false}});

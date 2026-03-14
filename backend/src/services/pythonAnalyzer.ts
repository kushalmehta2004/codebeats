import axios from 'axios';

import { config } from '../config';
import type { FileMetrics, ParsedFile } from '../types';

interface PythonAnalyzerRequest {
  files: Array<{
    path: string;
    content: string;
    loc: number;
  }>;
}

interface PythonAnalyzerResponse {
  metrics: FileMetrics[];
}

/**
 * Sends Python source files to the Flask microservice and returns per-file metrics.
 * Returns fallback parse-error metrics if the Python service is unavailable.
 */
export async function analyzePythonFiles(files: ParsedFile[]): Promise<FileMetrics[]> {
  if (files.length === 0) return [];

  try {
    const payload: PythonAnalyzerRequest = {
      files: files.map((file) => ({
        path: file.path,
        content: file.content,
        loc: file.loc,
      })),
    };

    const response = await axios.post<PythonAnalyzerResponse>(
      `${config.pythonService.baseUrl}/analyze-python`,
      payload,
      {
        timeout: config.pythonService.timeoutMs,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (!Array.isArray(response.data?.metrics)) {
      throw new Error('Invalid Python analyzer response shape');
    }

    return response.data.metrics;
  } catch (err: any) {
    console.warn(`[pythonAnalyzer] Python service unavailable, falling back with parse errors: ${err?.message ?? 'unknown error'}`);
    return files.map((file) => ({
      path: file.path,
      loc: file.loc,
      functions: [],
      imports: [],
      exports: [],
      isTestFile: /(?:^|[/\\])tests?[/\\]|(?:_test\.py$)|(?:test_.*\.py$)/i.test(file.path),
      parseError: 'Python analyzer unavailable',
    }));
  }
}

/**
 * Label Studio API Client
 * Wrapper for interacting with Label Studio REST API
 */

import { LabelStudioTask } from './enhanced-annotation-types.js';

export interface LabelStudioConfig {
  url: string;
  apiKey: string;
}

export interface LabelStudioProject {
  id: number;
  title: string;
  description?: string;
  label_config: string; // XML configuration
  created_at: string;
  updated_at: string;
}

export interface LabelStudioAnnotation {
  id: number;
  completed_by: number;
  result: any[];
  was_cancelled: boolean;
  ground_truth: boolean;
  created_at: string;
  updated_at: string;
  lead_time: number;
  task: number;
}

/**
 * Label Studio REST API client
 */
export class LabelStudioClient {
  private baseUrl: string;
  private apiKey: string;
  private headers: HeadersInit;

  constructor(config: LabelStudioConfig) {
    this.baseUrl = config.url.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.headers = {
      'Authorization': `Token ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a new project
   */
  async createProject(
    title: string,
    labelConfig: string,
    description?: string
  ): Promise<LabelStudioProject> {
    const response = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        title,
        description,
        label_config: labelConfig,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: number): Promise<LabelStudioProject> {
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get project: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List all projects
   */
  async listProjects(): Promise<LabelStudioProject[]> {
    const response = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results || data;
  }

  /**
   * Update project configuration
   */
  async updateProject(
    projectId: number,
    updates: Partial<{
      title: string;
      description: string;
      label_config: string;
    }>
  ): Promise<LabelStudioProject> {
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`Failed to update project: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Import tasks into a project
   */
  async importTasks(
    projectId: number,
    tasks: LabelStudioTask[]
  ): Promise<{ task_count: number; annotation_count: number; predictions_count: number }> {
    const response = await fetch(`${this.baseUrl}/api/projects/${projectId}/import`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(tasks),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to import tasks: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get a specific task
   */
  async getTask(taskId: number): Promise<LabelStudioTask> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get task: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List tasks for a project
   */
  async listTasks(
    projectId: number,
    options?: {
      page?: number;
      page_size?: number;
      view?: number;
      filter?: string;
    }
  ): Promise<{ tasks: LabelStudioTask[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.page_size) params.append('page_size', options.page_size.toString());
    if (options?.view) params.append('view', options.view.toString());
    if (options?.filter) params.append('filter', options.filter);

    const url = `${this.baseUrl}/api/projects/${projectId}/tasks?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to list tasks: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      tasks: data.results || data,
      total: data.count || (data.results || data).length,
    };
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to delete task: ${response.statusText}`);
    }
  }

  /**
   * Get annotations for a task
   */
  async getTaskAnnotations(taskId: number): Promise<LabelStudioAnnotation[]> {
    const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}/annotations`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get annotations: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Export annotations from a project
   */
  async exportAnnotations(
    projectId: number,
    format: 'JSON' | 'JSON_MIN' | 'CSV' | 'TSV' | 'CONLL2003' | 'COCO' = 'JSON'
  ): Promise<any[]> {
    const response = await fetch(
      `${this.baseUrl}/api/projects/${projectId}/export?exportType=${format}`,
      {
        method: 'GET',
        headers: this.headers,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to export annotations: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create or update a webhook
   */
  async createWebhook(
    projectId: number,
    url: string,
    events: string[] = ['ANNOTATION_CREATED', 'ANNOTATION_UPDATED']
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/webhooks`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        url,
        send_payload: true,
        send_for_all_actions: false,
        headers: {},
        is_active: true,
        actions: events,
        project: projectId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create webhook: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * List webhooks for a project
   */
  async listWebhooks(projectId?: number): Promise<any[]> {
    const url = projectId
      ? `${this.baseUrl}/api/webhooks?project=${projectId}`
      : `${this.baseUrl}/api/webhooks`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to list webhooks: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to delete webhook: ${response.statusText}`);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; version: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      throw new Error(`Label Studio is not accessible: ${error}`);
    }
  }

  /**
   * Test connection and authentication
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.listProjects();
      return true;
    } catch (error) {
      console.error('Label Studio connection test failed:', error);
      return false;
    }
  }
}

/**
 * Get Label Studio client instance
 */
export function getLabelStudioClient(): LabelStudioClient {
  const url = process.env.LABEL_STUDIO_URL || 'http://localhost:8080';
  const apiKey = process.env.LABEL_STUDIO_API_KEY;

  if (!apiKey) {
    throw new Error(
      'LABEL_STUDIO_API_KEY environment variable is required. ' +
      'Generate an API key in Label Studio: Account & Settings > Access Token'
    );
  }

  return new LabelStudioClient({ url, apiKey });
}

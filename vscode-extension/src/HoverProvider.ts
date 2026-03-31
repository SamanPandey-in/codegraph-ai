import * as vscode from 'vscode';
import { ApiClient } from './ApiClient';

export class HoverProvider implements vscode.HoverProvider {
  constructor(private api: ApiClient) {}

  async provideHover(document: vscode.TextDocument): Promise<vscode.Hover | null> {
    const jobId = this.api.currentJobId;
    if (!jobId) return null;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const relativePath = document.uri.fsPath.replace(workspaceRoot + '/', '');

    try {
      const graph = await this.api.getGraph(jobId);
      const node = graph?.graph?.[relativePath];
      if (!node) return null;

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.appendMarkdown(`**CodeGraph AI** — \`${relativePath}\`\n\n`);
      if (node.summary) markdown.appendMarkdown(`${node.summary}\n\n`);
      markdown.appendMarkdown(`- **Deps:** ${node.deps?.length || 0}  `);
      markdown.appendMarkdown(`**Used by:** ${Object.values(graph.graph).filter((n: any) => n.deps?.includes(relativePath)).length}\n\n`);
      markdown.appendMarkdown(`[Open in Graph](command:codegraphAi.openGraph)`);

      return new vscode.Hover(markdown);
    } catch {
      return null;
    }
  }
}

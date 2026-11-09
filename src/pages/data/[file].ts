// Publishes the editable data files as they are (data/team.yaml, data/news.yaml, data/papers.bib),
// so the site editor's demo mode can read the current site without signing in to GitHub.
import type { APIRoute } from "astro";
import team from "../../data/team.yaml?raw";
import news from "../../data/news.yaml?raw";
import papers from "../../data/papers.bib?raw";

const FILES: Record<string, string> = { "team.yaml": team, "news.yaml": news, "papers.bib": papers };

export function getStaticPaths() {
  return Object.keys(FILES).map((file) => ({ params: { file } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(FILES[params.file as string], { headers: { "Content-Type": "text/plain; charset=utf-8" } });

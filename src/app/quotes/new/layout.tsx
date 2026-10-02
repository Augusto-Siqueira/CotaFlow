// A página lê ?duplicate= via searchParams, mas isso só acontece depois do
// AdminGate liberar o conteúdo; sem forçar dinâmico o Next pré-renderiza a
// rota como estática e a cotação duplicada chega vazia.
export const dynamic = "force-dynamic";

export default function NewQuoteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

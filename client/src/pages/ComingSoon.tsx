import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface ComingSoonProps {
  title?: string;
}

export default function ComingSoon({ title = "Módulo" }: ComingSoonProps) {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
        <Construction className="w-8 h-8 text-amber-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="text-muted-foreground text-sm mt-1 max-w-xs">
          Este módulo está em desenvolvimento e estará disponível em breve.
        </p>
      </div>
      <Button variant="outline" onClick={() => navigate("/dashboard")}>
        Voltar ao Dashboard
      </Button>
    </div>
  );
}

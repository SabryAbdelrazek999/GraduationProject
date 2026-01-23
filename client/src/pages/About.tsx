import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Code, Users, Award } from "lucide-react";

export default function About() {
  return (
    <div className="p-6 space-y-6" data-testid="page-about">
      <h1 className="text-2xl font-semibold text-foreground">About</h1>

      <Card className="bg-card border-card-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            ZAP OWASP Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            ZAP OWASP Scanner is a professional-grade web vulnerability scanning tool
            designed to help security researchers and developers identify and fix
            security issues in web applications.
          </p>
          <p className="text-muted-foreground">
            Built on industry-standard security testing methodologies, our scanner
            detects common vulnerabilities including XSS, SQL Injection, CSRF, and
            many more from the OWASP Top 10.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-card-border">
          <CardContent className="p-6 text-center">
            <Code className="w-10 h-10 text-primary mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Open Source</h3>
            <p className="text-sm text-muted-foreground">
              Built on open-source technologies and security standards
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-6 text-center">
            <Users className="w-10 h-10 text-primary mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Community Driven</h3>
            <p className="text-sm text-muted-foreground">
              Supported by a global community of security professionals
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardContent className="p-6 text-center">
            <Award className="w-10 h-10 text-primary mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-2">Industry Standard</h3>
            <p className="text-sm text-muted-foreground">
              Trusted by enterprises and security teams worldwide
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-card-border">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            Version 1.2025 | Powered by OWASP Security Standards
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

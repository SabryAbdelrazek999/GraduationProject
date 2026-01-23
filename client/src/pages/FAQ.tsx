import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle } from "lucide-react";

const faqs = [
  {
    question: "What types of vulnerabilities can ZAP detect?",
    answer:
      "ZAP can detect a wide range of vulnerabilities including Cross-Site Scripting (XSS), SQL Injection, Cross-Site Request Forgery (CSRF), security misconfigurations, broken authentication, sensitive data exposure, and many more from the OWASP Top 10 list.",
  },
  {
    question: "How long does a scan typically take?",
    answer:
      "Scan duration depends on the size and complexity of the target website. A quick scan typically takes 5-15 minutes, while a comprehensive deep scan can take several hours for large applications with many pages and endpoints.",
  },
  {
    question: "Is it safe to scan my production website?",
    answer:
      "While ZAP is designed to be safe, we recommend testing on staging environments first. Some active scanning techniques may cause load on your servers or trigger security alerts. Always ensure you have proper authorization before scanning any website.",
  },
  {
    question: "Can I schedule automated scans?",
    answer:
      "Yes! ZAP supports scheduled scanning. You can configure daily, weekly, or monthly scans through the Scheduling page. This helps maintain continuous security monitoring of your web applications.",
  },
  {
    question: "How do I interpret scan results?",
    answer:
      "Scan results are categorized by severity: Critical, High, Medium, and Low. Each finding includes a description, affected URL, and remediation guidance. Start by addressing Critical and High severity issues first.",
  },
  {
    question: "Can I export scan reports?",
    answer:
      "Yes, reports can be exported in multiple formats including JSON, HTML, and PDF. Navigate to the Reports page to download or share your scan results with team members.",
  },
  {
    question: "Do I need technical expertise to use ZAP?",
    answer:
      "ZAP is designed to be user-friendly with an intuitive interface. Basic scans require only a URL. However, for advanced configurations and understanding detailed vulnerabilities, some security knowledge is helpful.",
  },
  {
    question: "How do I get API access?",
    answer:
      "API keys can be generated from the Settings page. The API allows you to integrate ZAP scanning into your CI/CD pipeline or custom security workflows.",
  },
];

export default function FAQ() {
  return (
    <div className="p-6 space-y-6" data-testid="page-faq">
      <h1 className="text-2xl font-semibold text-foreground">FAQ</h1>

      <Card className="bg-card border-card-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger
                  className="text-left"
                  data-testid={`faq-question-${index}`}
                >
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

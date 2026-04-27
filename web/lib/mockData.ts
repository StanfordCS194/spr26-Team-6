import type { Rfp } from "./types";

function buildSow(description: string): string {
  return `## Statement of work\n\n${description}\n\n### Deliverables\n\n- Kickoff and discovery within 30 days of award.\n- Monthly status reporting through the performance period.\n- Final acceptance testing and handoff documentation.\n\n### Period of performance\n\nWork is expected to complete within **12 months** of contract start.\n`;
}

function buildAiAnalysis(score: number, location: string): string {
  const geoNote = location.includes("CA")
    ? "Verify CA small business and in-state preferences where applicable."
    : "Check local subcontracting and geographic set-asides.";
  return `### Compatibility summary\n\nYour profile aligns at **${score}/100** with this opportunity based on mock scoring (replace with RAG + contractor embeddings).\n\n### Gap analysis (stub)\n\n- **Security / compliance:** Confirm required certifications (e.g. FedRAMP, StateRAMP) against your past performance.\n- **Staffing:** Validate key personnel clauses vs. bench depth for similar programs.\n- **Geography:** ${geoNote}\n\n### Score breakdown (stub)\n\n| Factor | Weight | Notes |\n| --- | --- | --- |\n| Past performance match | 35% | Heuristic placeholder |\n| Technical keywords | 25% | From RFP tags vs. profile text |\n| Geography | 20% | Location overlap |\n| Contract size fit | 20% | vs. typical deal size |\n`;
}

const raw: Omit<Rfp, "sowMarkdown" | "aiAnalysisMarkdown">[] = [
  {
    id: 1,
    title: "Request for cybersecurity management in San Jose data center",
    agency: "City of San Jose",
    dueDate: "2026-05-15",
    score: 94,
    tags: ["Cybersecurity", "Data Centers", "San Jose", "Technology"],
    location: "San Jose, CA",
    contract: "$1.2M",
    description:
      "Deliver managed cybersecurity services, incident response readiness, and compliance monitoring for the San Jose data center campus.",
  },
  {
    id: 2,
    title: "Request for cloud migration compliance assessment for Los Angeles agency",
    agency: "City of Los Angeles",
    dueDate: "2026-05-22",
    score: 88,
    tags: ["Cloud", "Compliance", "Los Angeles", "Migration"],
    location: "Los Angeles, CA",
    contract: "$850K",
    description:
      "Assess current systems and develop a secure cloud migration strategy aligned with federal regulations and agency requirements.",
  },
  {
    id: 3,
    title: "Request for facility security upgrade at Sacramento operations center",
    agency: "State of California",
    dueDate: "2026-06-03",
    score: 79,
    tags: ["Facilities", "Security", "Sacramento", "Operations"],
    location: "Sacramento, CA",
    contract: "$620K",
    description:
      "Provide physical security system enhancements and access-control modernization for the Sacramento operations site.",
  },
  {
    id: 4,
    title: "Request for AI-powered document review platform for San Diego office",
    agency: "City of San Diego",
    dueDate: "2026-06-10",
    score: 92,
    tags: ["AI", "Document Review", "San Diego", "Automation"],
    location: "San Diego, CA",
    contract: "$1.8M",
    description:
      "Build an AI-assisted review engine to streamline document validation, redaction, and compliance reporting for the San Diego office.",
  },
  {
    id: 5,
    title: "Request for wireless infrastructure upgrade at Oakland command hub",
    agency: "City of Oakland",
    dueDate: "2026-06-18",
    score: 81,
    tags: ["Wireless", "Infrastructure", "Oakland", "Networking"],
    location: "Oakland, CA",
    contract: "$1.05M",
    description:
      "Design and deploy high-reliability wireless networking infrastructure that supports secure government operations at the command hub.",
  },
  {
    id: 6,
    title: "Request for environmental monitoring system in Fresno",
    agency: "City of Fresno",
    dueDate: "2026-06-25",
    score: 85,
    tags: ["Environment", "Monitoring", "Fresno", "Sustainability"],
    location: "Fresno, CA",
    contract: "$750K",
    description:
      "Implement a comprehensive environmental monitoring system to track air quality, water resources, and climate data in Fresno.",
  },
  {
    id: 7,
    title: "Request for smart city infrastructure in Bakersfield",
    agency: "City of Bakersfield",
    dueDate: "2026-07-02",
    score: 90,
    tags: ["Smart City", "Infrastructure", "Bakersfield", "IoT"],
    location: "Bakersfield, CA",
    contract: "$2.1M",
    description:
      "Develop smart city technologies including IoT sensors, traffic management, and energy-efficient systems for Bakersfield.",
  },
  {
    id: 8,
    title: "Request for healthcare data analytics platform in Anaheim",
    agency: "City of Anaheim",
    dueDate: "2026-07-10",
    score: 87,
    tags: ["Healthcare", "Data Analytics", "Anaheim", "Public Health"],
    location: "Anaheim, CA",
    contract: "$1.5M",
    description:
      "Create a secure data analytics platform for healthcare data management and patient outcome analysis in Anaheim.",
  },
  {
    id: 9,
    title: "Request for renewable energy assessment in Santa Ana",
    agency: "City of Santa Ana",
    dueDate: "2026-07-18",
    score: 83,
    tags: ["Renewable Energy", "Assessment", "Santa Ana", "Green Energy"],
    location: "Santa Ana, CA",
    contract: "$680K",
    description:
      "Conduct a comprehensive assessment of renewable energy potential and develop implementation strategies for Santa Ana.",
  },
  {
    id: 10,
    title: "Request for public transportation optimization in Irvine",
    agency: "City of Irvine",
    dueDate: "2026-07-25",
    score: 89,
    tags: ["Transportation", "Optimization", "Irvine", "Mobility"],
    location: "Irvine, CA",
    contract: "$1.3M",
    description:
      "Optimize public transportation systems with AI-driven scheduling and real-time tracking for Irvine's transit network.",
  },
];

export const MOCK_RFPS: Rfp[] = raw.map((r) => ({
  ...r,
  sowMarkdown: buildSow(r.description),
  aiAnalysisMarkdown: buildAiAnalysis(r.score, r.location),
}));

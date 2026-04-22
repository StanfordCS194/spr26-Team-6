const rfps = [
  {
    id: 1,
    title: "Request for cybersecurity management in San Jose data center",
    dueDate: "2026-05-15",
    score: 94,
    tags: ["Cybersecurity", "Data Centers", "San Jose", "City of San Jose", "Technology"],
    location: "San Jose, CA",
    contract: "$1.2M",
    description: "Deliver managed cybersecurity services, incident response readiness, and compliance monitoring for the San Jose data center campus.",
  },
  {
    id: 2,
    title: "Request for cloud migration compliance assessment for Los Angeles agency",
    dueDate: "2026-05-22",
    score: 88,
    tags: ["Cloud", "Compliance", "Los Angeles", "City of Los Angeles", "Migration"],
    location: "Los Angeles, CA",
    contract: "$850K",
    description: "Assess current systems and develop a secure cloud migration strategy aligned with federal regulations and agency requirements.",
  },
  {
    id: 3,
    title: "Request for facility security upgrade at Sacramento operations center",
    dueDate: "2026-06-03",
    score: 79,
    tags: ["Facilities", "Security", "Sacramento", "State of California", "Operations"],
    location: "Sacramento, CA",
    contract: "$620K",
    description: "Provide physical security system enhancements and access-control modernization for the Sacramento operations site.",
  },
  {
    id: 4,
    title: "Request for AI-powered document review platform for San Diego office",
    dueDate: "2026-06-10",
    score: 92,
    tags: ["AI", "Document Review", "San Diego", "City of San Diego", "Automation"],
    location: "San Diego, CA",
    contract: "$1.8M",
    description: "Build an AI-assisted review engine to streamline document validation, redaction, and compliance reporting for the San Diego office.",
  },
  {
    id: 5,
    title: "Request for wireless infrastructure upgrade at Oakland command hub",
    dueDate: "2026-06-18",
    score: 81,
    tags: ["Wireless", "Infrastructure", "Oakland", "City of Oakland", "Networking"],
    location: "Oakland, CA",
    contract: "$1.05M",
    description: "Design and deploy high-reliability wireless networking infrastructure that supports secure government operations at the command hub.",
  },
  {
    id: 6,
    title: "Request for environmental monitoring system in Fresno",
    dueDate: "2026-06-25",
    score: 85,
    tags: ["Environment", "Monitoring", "Fresno", "City of Fresno", "Sustainability"],
    location: "Fresno, CA",
    contract: "$750K",
    description: "Implement a comprehensive environmental monitoring system to track air quality, water resources, and climate data in Fresno.",
  },
  {
    id: 7,
    title: "Request for smart city infrastructure in Bakersfield",
    dueDate: "2026-07-02",
    score: 90,
    tags: ["Smart City", "Infrastructure", "Bakersfield", "City of Bakersfield", "IoT"],
    location: "Bakersfield, CA",
    contract: "$2.1M",
    description: "Develop smart city technologies including IoT sensors, traffic management, and energy-efficient systems for Bakersfield.",
  },
  {
    id: 8,
    title: "Request for healthcare data analytics platform in Anaheim",
    dueDate: "2026-07-10",
    score: 87,
    tags: ["Healthcare", "Data Analytics", "Anaheim", "City of Anaheim", "Public Health"],
    location: "Anaheim, CA",
    contract: "$1.5M",
    description: "Create a secure data analytics platform for healthcare data management and patient outcome analysis in Anaheim.",
  },
  {
    id: 9,
    title: "Request for renewable energy assessment in Santa Ana",
    dueDate: "2026-07-18",
    score: 83,
    tags: ["Renewable Energy", "Assessment", "Santa Ana", "City of Santa Ana", "Green Energy"],
    location: "Santa Ana, CA",
    contract: "$680K",
    description: "Conduct a comprehensive assessment of renewable energy potential and develop implementation strategies for Santa Ana.",
  },
  {
    id: 10,
    title: "Request for public transportation optimization in Irvine",
    dueDate: "2026-07-25",
    score: 89,
    tags: ["Transportation", "Optimization", "Irvine", "City of Irvine", "Mobility"],
    location: "Irvine, CA",
    contract: "$1.3M",
    description: "Optimize public transportation systems with AI-driven scheduling and real-time tracking for Irvine's transit network.",
  },
];

const rfpListEl = document.getElementById("rfpList");
const detailCardEl = document.getElementById("detailCard");
const profileIcon = document.getElementById("profileIcon");
const profileDropdown = document.getElementById("profileDropdown");
let selectedId = null;

profileIcon.addEventListener("click", () => {
  profileDropdown.classList.toggle("show");
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!profileIcon.contains(e.target) && !profileDropdown.contains(e.target)) {
    profileDropdown.classList.remove("show");
  }
});

function tagClass(index) {
  const classes = ["tag--purple", "tag--teal", "tag--blue", "tag--amber", "tag--slate"];
  return classes[index % classes.length];
}

function renderRfps() {
  rfpListEl.innerHTML = "";
  rfps.forEach((rfp, idx) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "rfp-card";
    if (rfp.id === selectedId) {
      card.classList.add("active");
    }
    card.onclick = () => selectRfp(rfp.id);

    card.innerHTML = `
      <h3>${rfp.title}</h3>
      <div class="meta">Due Date: ${rfp.dueDate}<br>Compatibility Score: ${rfp.score}/100</div>
      <div class="tag-list">
        ${rfp.tags.map((tag, tagIndex) => `<span class="tag ${tagClass(tagIndex)}">${tag}</span>`).join("")}
      </div>
    `;

    rfpListEl.appendChild(card);
  });
}

function selectRfp(id) {
  selectedId = id;
  const rfp = rfps.find((item) => item.id === id);
  renderRfps();
  renderDetail(rfp);
}

function renderDetail(rfp) {
  detailCardEl.innerHTML = "";

  const title = document.createElement("h2");
  title.className = "detail-title";
  title.textContent = rfp.title;

  const description = document.createElement("p");
  description.className = "detail-meta";
  description.textContent = rfp.description;

  const row = document.createElement("div");
  row.className = "detail-row";

  const locationBlock = document.createElement("div");
  locationBlock.innerHTML = `<div class="detail-label">Location</div><div class="detail-value">${rfp.location}</div>`;

  const contractBlock = document.createElement("div");
  contractBlock.innerHTML = `<div class="detail-label">Contract Amount</div><div class="detail-value">${rfp.contract}</div>`;

  row.appendChild(locationBlock);
  row.appendChild(contractBlock);

  const actions = document.createElement("div");
  actions.className = "detail-actions";

  const summaryButton = document.createElement("button");
  summaryButton.type = "button";
  summaryButton.className = "btn btn-primary";
  summaryButton.textContent = "Generate Summary";
  summaryButton.onclick = () => alert(`Generate Summary for: ${rfp.title}`);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "btn btn-secondary";
  saveButton.textContent = "Save Project";
  saveButton.onclick = () => alert(`Save Project: ${rfp.title}`);

  const proposalButton = document.createElement("button");
  proposalButton.type = "button";
  proposalButton.className = "btn btn-primary";
  proposalButton.textContent = "Generate Example Proposal";
  proposalButton.onclick = () => alert(`Generate Example Proposal for: ${rfp.title}`);

  actions.appendChild(summaryButton);
  actions.appendChild(saveButton);
  actions.appendChild(proposalButton);

  detailCardEl.appendChild(title);
  detailCardEl.appendChild(description);
  detailCardEl.appendChild(row);
  detailCardEl.appendChild(actions);
}

renderRfps();

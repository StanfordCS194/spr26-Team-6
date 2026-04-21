const rfps = [
  {
    id: 1,
    title: "Request for cybersecurity management in San Jose data center",
    dueDate: "2026-05-15",
    score: 94,
    tags: ["Cybersecurity", "Data Centers", "San Jose"],
    location: "San Jose, CA",
    contract: "$1.2M",
    description: "Deliver managed cybersecurity services, incident response readiness, and compliance monitoring for the San Jose data center campus.",
  },
  {
    id: 2,
    title: "Request for cloud migration compliance assessment for Boston agency",
    dueDate: "2026-05-22",
    score: 88,
    tags: ["Cloud", "Compliance", "Boston"],
    location: "Boston, MA",
    contract: "$850K",
    description: "Assess current systems and develop a secure cloud migration strategy aligned with federal regulations and agency requirements.",
  },
  {
    id: 3,
    title: "Request for facility security upgrade at Phoenix operations center",
    dueDate: "2026-06-03",
    score: 79,
    tags: ["Facilities", "Security", "Phoenix"],
    location: "Phoenix, AZ",
    contract: "$620K",
    description: "Provide physical security system enhancements and access-control modernization for the Phoenix operations site.",
  },
  {
    id: 4,
    title: "Request for AI-powered document review platform for DC office",
    dueDate: "2026-06-10",
    score: 92,
    tags: ["AI", "Document Review", "Washington DC"],
    location: "Washington, DC",
    contract: "$1.8M",
    description: "Build an AI-assisted review engine to streamline document validation, redaction, and compliance reporting for the DC office.",
  },
  {
    id: 5,
    title: "Request for wireless infrastructure upgrade at Seattle command hub",
    dueDate: "2026-06-18",
    score: 81,
    tags: ["Wireless", "Infrastructure", "Seattle"],
    location: "Seattle, WA",
    contract: "$1.05M",
    description: "Design and deploy high-reliability wireless networking infrastructure that supports secure government operations at the command hub.",
  },
];

const rfpListEl = document.getElementById("rfpList");
const detailCardEl = document.getElementById("detailCard");
let selectedId = null;

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
      <div class="meta">Due Date: ${rfp.dueDate} · Compatibility Score: ${rfp.score}/100</div>
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
  summaryButton.className = "btn btn-secondary";
  summaryButton.textContent = "Generate Summary";
  summaryButton.onclick = () => alert(`Generate Summary for: ${rfp.title}`);

  const proposalButton = document.createElement("button");
  proposalButton.type = "button";
  proposalButton.className = "btn btn-primary";
  proposalButton.textContent = "Generate Example Proposal";
  proposalButton.onclick = () => alert(`Generate Example Proposal for: ${rfp.title}`);

  actions.appendChild(summaryButton);
  actions.appendChild(proposalButton);

  detailCardEl.appendChild(title);
  detailCardEl.appendChild(description);
  detailCardEl.appendChild(row);
  detailCardEl.appendChild(actions);
}

renderRfps();

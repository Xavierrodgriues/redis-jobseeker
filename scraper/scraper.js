global.File = class File { };
const { connectToMongo } = require('./mongo');
const { searchAndSaveJobLinks } = require('./jobSearch/jobSearcher');

async function runScraper() {
  await connectToMongo();
  console.log('Connected to MongoDB');

  const roles = [
    "Backend Engineering (Java, .NET, Python, Go)",
    "Frontend Engineering (React, Angular, Vue)",
    "Full-Stack Development",
    "Mobile Development (iOS, Android)",
    "API & Microservices Engineering",
    "Embedded Systems & Firmware",
    "Desktop Application Development",
    "Low-Code / No-Code Platforms",
    "Legacy System Modernization",
    "Cloud Engineering (AWS, Azure, GCP)",
    "Cloud Architecture & Design",
    "Hybrid & Multi-Cloud Engineering",
    "Cloud Migration & Modernization",
    "Cloud Cost Optimization (FinOps)",
    "Cloud Governance & Landing Zones",
    "Cloud Networking",
    "Cloud Identity & Access",
    "Cloud Operations (CloudOps)",
    "DevOps Engineering",
    "Platform Engineering",
    "Site Reliability Engineering (SRE)",
    "CI/CD Engineering",
    "Release Engineering",
    "Infrastructure as Code (IaC)",
    "GitOps Engineering",
    "Observability & Reliability Engineering",
    "Chaos Engineering",
    "Security Operations Center (SOC)",
    "Incident Response & Threat Hunting",
    "Vulnerability Management",
    "Application Security (AppSec)",
    "Cloud Security Engineering",
    "Network Security",
    "Endpoint Security",
    "Identity & Access Management (IAM)",
    "Zero Trust Architecture",
    "Security Automation & SOAR",
    "FedRAMP Engineering",
    "FISMA Compliance",
    "NIST 800-53 / 800-171",
    "SOC 2 / ISO 27001",
    "HIPAA / HITRUST",
    "PCI-DSS",
    "Risk Management Framework (RMF)",
    "POA&M Management",
    "Audit Readiness & Evidence Automation",
    "Data Engineering",
    "Analytics Engineering",
    "Business Intelligence (BI)",
    "Data Warehousing",
    "ETL / ELT Development",
    "Data Governance & Quality",
    "Master Data Management (MDM)",
    "Reporting & Dashboards",
    "Data Operations (DataOps)",
    "Machine Learning Engineering",
    "Deep Learning",
    "Generative AI / LLM Engineering",
    "MLOps",
    "Model Monitoring & Drift Detection",
    "NLP / Computer Vision",
    "AI Governance & Responsible AI",
    "AI Security",
    "Prompt Engineering",
    "Network Engineering (LAN/WAN)",
    "SD-WAN Engineering",
    "Data Center Networking",
    "Load Balancing & Traffic Management",
    "Network Automation",
    "Telecom & Carrier Networks",
    "Wireless & Mobility",
    "Network Monitoring & Performance",
    "Windows Server Administration",
    "Linux/Unix Administration",
    "Virtualization (VMware, Hyper-V)",
    "Patch Management",
    "OS Hardening",
    "Identity Services (AD, LDAP)",
    "Server Performance Tuning",
    "Backup & Recovery",
    "Endpoint Management",
    "Docker & Container Engineering",
    "Kubernetes Administration",
    "Kubernetes Platform Engineering",
    "OpenShift Engineering",
    "Virtual Machines & Hypervisors",
    "Serverless Platforms",
    "Edge Computing",
    "High-Availability Compute",
    "Incident Management",
    "Problem Management",
    "Change & Release Management",
    "Configuration Management (CMDB)",
    "ServiceNow Administration & Development",
    "SLA / SLO Management",
    "IT Operations Management (ITOM)",
    "IT Asset Management (ITAM)",
    "ERP Systems (SAP, Oracle)",
    "CRM Systems (Salesforce, Dynamics)",
    "HR Systems (Workday)",
    "Financial Systems",
    "Enterprise Integration",
    "Middleware Platforms",
    "Business Process Automation (BPM)",
    "RPA (UiPath, Power Automate)",
    "Business Analysis",
    "Product Management",
    "Technical Product Management",
    "Project Management (PMP)",
    "Program & Portfolio Management",
    "Scrum Master / Agile Coach",
    "PMO & Governance",
    "Stakeholder Management",
    "Manual Testing",
    "Automation Testing",
    "Performance & Load Testing",
    "Security Testing",
    "API Testing",
    "UAT Coordination",
    "Test Engineering",
    "Quality Assurance Leadership",
    "Monitoring Engineering",
    "Logging & SIEM Engineering",
    "Metrics & Tracing",
    "Alerting & Incident Response",
    "Capacity Planning",
    "Operational Analytics",
    "Reliability Dashboards",
    "Root Cause Analysis (RCA)",
    "Active Directory Engineering",
    "Azure AD / Entra ID",
    "SSO / SAML / OAuth",
    "Privileged Access Management (PAM)",
    "Identity Governance",
    "Lifecycle Automation",
    "Directory Services Architecture",
    "Federation Services",
    "Desktop Engineering",
    "MDM / MAM",
    "O365 / Google Workspace",
    "VDI / DaaS",
    "Collaboration Platforms",
    "Device Lifecycle Management",
    "User Experience (DEX)",
    "Storage Engineering",
    "SAN / NAS",
    "Object Storage",
    "Backup & Restore",
    "Disaster Recovery",
    "Business Continuity",
    "Data Replication",
    "Archival Systems",
    "API Management",
    "ESB Platforms",
    "Event-Driven Architecture",
    "Messaging Systems",
    "Data Streaming (Kafka)",
    "Integration Platforms",
    "Service Mesh",
    "Workflow Engines",
    "Blockchain Engineering",
    "IoT Engineering",
    "Quantum Computing (early stage)",
    "XR / AR / VR",
    "Digital Twins",
    "Robotics & Automation",
    "Smart Infrastructure",
    "Federal Cloud Engineering",
    "DHS / DoD Systems Engineering",
    "Classified Systems Support",
    "Public Trust / Clearance Roles",
    "Secure Network Architecture",
    "Continuous Monitoring (ConMon)",
    "Authority to Operate (ATO)",
    "Mission-Critical Systems",
    "IT Management",
    "Engineering Management",
    "Cloud Strategy",
    "Enterprise Architecture",
    "CTO / CIO Track",
    "Technology Risk Management",
    "Vendor & Contract Management",
    "Digital Transformation Leadership"
  ];

  const experiences = [
    'Entry Level',
    'Mid Level',
    'Senior Level'
  ];

  const location = 'United States';
  const processId = process.pid.toString();

  for (const role of roles) {
    for (const experience of experiences) {
      const jobData = {
        role,
        experience,
        location
      };

      console.log(`Scraping: ${role} | ${experience}`);

      try {
        await searchAndSaveJobLinks(jobData, processId);
      } catch (err) {
        console.error('Error scraping job:', err.message);
      }

      // small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('Scraping completed. Exiting.');
  process.exit(0);
}

runScraper().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

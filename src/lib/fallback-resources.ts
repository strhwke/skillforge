import type { ResourceItem } from "./types";

/**
 * Last-line-of-defense static resource catalog. Used only when grounded search fails or returns
 * dead/empty results. Kept short and evergreen.
 */
export const FALLBACK_RESOURCES: Record<string, ResourceItem[]> = {
  graphql: [
    {
      title: "How to GraphQL",
      url: "https://www.howtographql.com/",
      type: "tutorial",
      hours_estimate: 12,
      why_chosen: "Free, hands-on, walks through Apollo Server with React clients end-to-end.",
      provider: "Prisma & community",
      is_free: true,
    },
    {
      title: "Apollo GraphQL — Odyssey: Lift-off",
      url: "https://www.apollographql.com/tutorials/lift-off-part1",
      type: "course",
      hours_estimate: 8,
      why_chosen: "Official Apollo learning path; the company behind the tooling Nimbus uses.",
      provider: "Apollo GraphQL",
      is_free: true,
    },
    {
      title: "GraphQL: Up and Running",
      url: "https://graphql.com/learn/",
      type: "reference",
      hours_estimate: 6,
      why_chosen: "Concise reference for schema-first thinking and resolver patterns.",
      provider: "GraphQL Foundation",
      is_free: true,
    },
  ],
  aws: [
    {
      title: "AWS Skill Builder — Cloud Practitioner Path",
      url: "https://explore.skillbuilder.aws/",
      type: "course",
      hours_estimate: 25,
      why_chosen: "Official AWS curriculum that covers ECS, RDS, IAM, CloudWatch in context.",
      provider: "AWS",
      is_free: true,
    },
    {
      title: "AWS in Plain English (free guides)",
      url: "https://aws.plainenglish.io/",
      type: "tutorial",
      hours_estimate: 10,
      why_chosen: "Practical walkthroughs from engineers who use AWS daily.",
      provider: "AWS in Plain English",
      is_free: true,
    },
    {
      title: "The AWS Well-Architected Framework",
      url: "https://aws.amazon.com/architecture/well-architected/",
      type: "reference",
      hours_estimate: 8,
      why_chosen: "Canonical reference for tradeoffs in real production architectures on AWS.",
      provider: "AWS",
      is_free: true,
    },
  ],
  "system design": [
    {
      title: "Designing Data-Intensive Applications",
      url: "https://dataintensive.net/",
      type: "book",
      hours_estimate: 40,
      why_chosen: "The single most-cited book by senior engineers for distributed systems intuition.",
      provider: "Martin Kleppmann · O'Reilly",
      is_free: false,
    },
    {
      title: "ByteByteGo System Design Newsletter",
      url: "https://bytebytego.com/",
      type: "course",
      hours_estimate: 30,
      why_chosen: "Visual, paced explanations of caches, queues, replication, sharding.",
      provider: "ByteByteGo",
      is_free: true,
    },
    {
      title: "System Design Primer",
      url: "https://github.com/donnemartin/system-design-primer",
      type: "reference",
      hours_estimate: 20,
      why_chosen: "Open repo aggregating the canonical interview-grade system design content.",
      provider: "donnemartin/community",
      is_free: true,
    },
  ],
  kubernetes: [
    {
      title: "Kubernetes the Hard Way",
      url: "https://github.com/kelseyhightower/kubernetes-the-hard-way",
      type: "tutorial",
      hours_estimate: 20,
      why_chosen: "Builds intuition for what Kubernetes actually does by setting it up step-by-step.",
      provider: "Kelsey Hightower",
      is_free: true,
    },
    {
      title: "Kubernetes Up and Running (3rd ed.)",
      url: "https://www.oreilly.com/library/view/kubernetes-up-and/9781098110192/",
      type: "book",
      hours_estimate: 25,
      why_chosen: "Approachable book by the people who built K8s.",
      provider: "O'Reilly",
      is_free: false,
    },
    {
      title: "Official Kubernetes Tutorials",
      url: "https://kubernetes.io/docs/tutorials/",
      type: "reference",
      hours_estimate: 12,
      why_chosen: "Authoritative, kept current with each release.",
      provider: "Kubernetes.io",
      is_free: true,
    },
  ],
  python: [
    {
      title: "Python for Everybody (PY4E)",
      url: "https://www.py4e.com/",
      type: "course",
      hours_estimate: 30,
      why_chosen: "Free, well-paced from zero to working in real Python projects.",
      provider: "Charles Severance",
      is_free: true,
    },
    {
      title: "Real Python Tutorials",
      url: "https://realpython.com/",
      type: "tutorial",
      hours_estimate: 12,
      why_chosen: "Topic-focused articles for engineers coming from another language.",
      provider: "Real Python",
      is_free: true,
    },
    {
      title: "Fluent Python (2nd ed.)",
      url: "https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/",
      type: "book",
      hours_estimate: 35,
      why_chosen: "The definitive book for going from intermediate to expert idiomatic Python.",
      provider: "Luciano Ramalho · O'Reilly",
      is_free: false,
    },
  ],
  generic: [
    {
      title: "MDN Web Docs",
      url: "https://developer.mozilla.org/",
      type: "reference",
      hours_estimate: 8,
      why_chosen: "Authoritative reference for any web platform topic.",
      provider: "MDN",
      is_free: true,
    },
    {
      title: "freeCodeCamp",
      url: "https://www.freecodecamp.org/",
      type: "course",
      hours_estimate: 30,
      why_chosen: "Free, hands-on courses across the modern web stack.",
      provider: "freeCodeCamp",
      is_free: true,
    },
    {
      title: "Awesome lists (GitHub)",
      url: "https://github.com/sindresorhus/awesome",
      type: "reference",
      hours_estimate: 4,
      why_chosen: "Curated topical reading lists maintained by the community.",
      provider: "GitHub community",
      is_free: true,
    },
  ],
};

export function getFallbackResources(skill: string): ResourceItem[] {
  const key = skill.toLowerCase();
  for (const k of Object.keys(FALLBACK_RESOURCES)) {
    if (key.includes(k) || k.includes(key)) return FALLBACK_RESOURCES[k];
  }
  return FALLBACK_RESOURCES.generic;
}

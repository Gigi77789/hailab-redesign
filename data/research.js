// Research areas. `papers` are title prefixes looked up in pubs.js; `topic` links to the filtered publication list.
window.HAI_AREAS = [
  {
    id: "health",
    topic: "health",
    name: "AI for health care",
    short: "Decision support that fits how clinicians, patients, and caregivers already work.",
    body: [
      "Medical AI often performs well on benchmarks and then gets abandoned on the ward. We study why. Our work with clinicians on sepsis diagnosis showed that experts need help in the middle of a decision, when they are forming hypotheses and deciding which tests to order, not only a final risk score.",
      "We build and evaluate systems for that work: CardioAI combines wearable and voice-assistant data to help oncologists catch treatment-induced heart damage early, and RECOVER supports remote monitoring after cancer surgery. We also design for family caregivers in the ICU and for young patients recovering from concussion."
    ],
    figure: { src: "assets/research/cardioai.png", alt: "CardioAI dashboard with patient information, an AI-generated daily summary, wearable sensor charts, an explainable risk score, and a conversation log.", caption: "CardioAI gives clinicians a daily summary, wearable data, and an explainable risk score for each patient." },
    papers: ["RECOVER", "CardioAI", "Rethinking Human-AI Collaboration in Complex Medical", "Exploring Collaboration Breakdowns", "\"It Felt Like I Was Left in the Dark\""]
  },
  {
    id: "education",
    topic: "education",
    name: "AI for learning",
    short: "Tools that support teachers, parents, and children instead of replacing them.",
    body: [
      "AI should not replace teachers. It should help everyone involved in learning teach and learn more easily. We design systems around the relationships that already exist: a parent reading with a child, a teacher running a class across campuses, a student deciding how to use generative AI.",
      "Projects include StoryBuddy, a chatbot that lets parents decide how involved they want to be in interactive storytelling; StorySparkQA and FairytaleQA, expert-annotated datasets for story-based learning; and field studies of live-streamed dual-teacher classrooms in under-resourced regions."
    ],
    figure: { src: "assets/research/storymate.png", alt: "Interface of an LLM-powered story reading companion for children.", caption: "An LLM-powered reading companion, designed with parents, teachers, and children." },
    papers: ["Characterizing LLM-Empowered Personalized Story", "StoryBuddy", "StorySpark", "Live-Streaming-Based Dual-Teacher", "Fantastic Questions and Where to Find Them"]
  },
  {
    id: "agents",
    topic: "agents",
    name: "LLM agents that simulate people",
    short: "Agents that behave like real users, so designs and studies can be tested before anyone is recruited.",
    body: [
      "Large language model agents can now browse, shop, and answer interviews. We ask how faithfully they reproduce what real people do, and how researchers can put that to use.",
      "UXAgent generates thousands of simulated participants for usability studies. Customer-R1 and our work on multi-turn shopping behavior train agents on real customer data. DPRF refines agent personas until their behavior matches the people they stand in for, and WebServ makes it practical to train web agents at scale."
    ],
    figure: { src: "assets/research/human-agent-architecture.png", alt: "Architecture diagram of a research platform for studying human-agent collaboration.", caption: "A configurable platform for studying how people and agents collaborate." },
    papers: ["Can LLM Agents Simulate Multi-Turn Human Behavior", "Through the Lens of Human-Human Collaboration", "UXAgent", "Customer-R1", "DPRF"]
  },
  {
    id: "data",
    topic: "data",
    name: "Human–AI collaboration in data work",
    short: "Putting AI into experts’ everyday annotation and data science work.",
    body: [
      "Much of an expert’s day is a form of data annotation: a doctor reading lab results, a judge applying the law. Language models still lack domain knowledge and often can’t be used on private data, so human labels remain essential.",
      "We build annotation platforms that pair experts with active-learning models to cut labeling cost while keeping quality high, study when human explanations actually help models, and continue a long line of work on how data scientists collaborate with automated AI."
    ],
    figure: { src: "assets/research/maj_eval.png", alt: "Diagram of a multi-agent evaluation framework aligned with multi-dimensional human evaluation.", caption: "Multi-agent-as-judge aligns automated evaluation with how human experts judge." },
    papers: ["Multi-agent-as-judge", "Human Still Wins over LLM", "Are human explanations always helpful", "Beyond Labels", "Human-ai collaboration in data science"]
  }
];

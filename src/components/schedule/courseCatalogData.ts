// Extracted from the user-provided College_Codes and CCES_Courses workbooks.
export const CCES_MAJORS = ["COSC", "AINT", "ITAP", "SOEN", "COEN", "CSEC"] as const;
export type CcesMajor = typeof CCES_MAJORS[number];

export const collegeCodeRules = [
  {
    "prefix": "COSC",
    "numeric": null,
    "college": "CCES"
  },
  {
    "prefix": "SOEN",
    "numeric": null,
    "college": "CCES"
  },
  {
    "prefix": "COEN",
    "numeric": null,
    "college": "CCES"
  },
  {
    "prefix": "AINT",
    "numeric": null,
    "college": "CCES"
  },
  {
    "prefix": "ITAP",
    "numeric": null,
    "college": "CCES"
  },
  {
    "prefix": "CSEC",
    "numeric": null,
    "college": "CCES"
  },
  {
    "prefix": "MATH",
    "numeric": "2313",
    "college": "CCES"
  },
  {
    "prefix": "MATH",
    "numeric": "3433",
    "college": "CCES"
  },
  {
    "prefix": "ASSE",
    "numeric": "4311",
    "college": "CCES"
  },
  {
    "prefix": "ACCT",
    "numeric": null,
    "college": "COBA"
  },
  {
    "prefix": "MISY",
    "numeric": null,
    "college": "COBA"
  },
  {
    "prefix": "BUSI",
    "numeric": null,
    "college": "COBA"
  },
  {
    "prefix": "FINA",
    "numeric": null,
    "college": "COBA"
  },
  {
    "prefix": "MKDM",
    "numeric": null,
    "college": "COBA"
  },
  {
    "prefix": "HRMT",
    "numeric": null,
    "college": "COBA"
  },
  {
    "prefix": "ASSE",
    "numeric": "4311",
    "college": "COBA"
  },
  {
    "prefix": "ARCH",
    "numeric": null,
    "college": "COAD"
  },
  {
    "prefix": "ITES",
    "numeric": null,
    "college": "COAD"
  },
  {
    "prefix": "GDES",
    "numeric": null,
    "college": "COAD"
  },
  {
    "prefix": "CVEN",
    "numeric": null,
    "college": "COE"
  },
  {
    "prefix": "EEEN",
    "numeric": null,
    "college": "COE"
  },
  {
    "prefix": "MEEN",
    "numeric": null,
    "college": "COE"
  },
  {
    "prefix": "CHEN",
    "numeric": null,
    "college": "COE"
  },
  {
    "prefix": "MATH",
    "numeric": "2332",
    "college": "COE"
  },
  {
    "prefix": "LAWB",
    "numeric": null,
    "college": "COL"
  },
  {
    "prefix": "LAWC",
    "numeric": null,
    "college": "COL"
  },
  {
    "prefix": "LAWE",
    "numeric": null,
    "college": "COL"
  },
  {
    "prefix": "INTL",
    "numeric": null,
    "college": "COL"
  },
  {
    "prefix": "ASSE",
    "numeric": "4311",
    "college": "COL"
  },
  {
    "prefix": "UNIV",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "COMM",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "ALIS",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "PHED",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "MATH",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "FREN",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "FURS",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "FUTR",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "GEGR",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "HIST",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "PSYC",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "SERV",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "SPAN",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "SUST",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "SYST",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "BSTW",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "DANT",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "ECON",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "BIOL",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "CHEM",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "PHYS",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "GEOL",
    "numeric": null,
    "college": "CSHS"
  },
  {
    "prefix": "ISLM",
    "numeric": null,
    "college": "CSHS"
  }
] as const;

export const ccesCourseCatalog: ReadonlyArray<{ code: string; title: string; hours: number; majors: readonly CcesMajor[] }> = [
  {
    "code": "ITAP 4313",
    "title": "Advanced Visual Programming",
    "hours": 3,
    "majors": [
      "ITAP"
    ]
  },
  {
    "code": "COSC 3351",
    "title": "Algorithms",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT"
    ]
  },
  {
    "code": "COSC 4362",
    "title": "Artificial Intelligence",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "AINT 3381",
    "title": "Big Data Analytics",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "COSC 4376",
    "title": "Bioinformatics",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT"
    ]
  },
  {
    "code": "ITAP 3382",
    "title": "Business Intelligence",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "COEN 2411",
    "title": "Circuits I",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 2411",
    "title": "Circuits I LAB",
    "hours": 3.4,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "ITAP 4315",
    "title": "Cloud Computing",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "COSC 4364",
    "title": "Compilers",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "ITAP 4396",
    "title": "Computer and Network Forensics",
    "hours": 3,
    "majors": [
      "ITAP"
    ]
  },
  {
    "code": "COSC 3359",
    "title": "Computer Animation",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "COSC 4371",
    "title": "Computer Graphics",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "COEN"
    ]
  },
  {
    "code": "COEN 3361",
    "title": "Computer Networks",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "COEN"
    ]
  },
  {
    "code": "GEIT 3331",
    "title": "Computer Organization",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "GEIT 1411",
    "title": "Computer Science I",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "GEIT 1411",
    "title": "Computer Science I LAB",
    "hours": 2.2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "GEIT 1412",
    "title": "Computer Science II",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "GEIT 1412",
    "title": "Computer Science II LAB",
    "hours": 2.2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "AINT 4373",
    "title": "Computer Vision",
    "hours": 3,
    "majors": [
      "COSC",
      "AINT",
      "COEN"
    ]
  },
  {
    "code": "SOEN 4316",
    "title": "Concurrent Programming",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "CSEC 4365",
    "title": "Critical Security Controls: Implementation and Auditing",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "CSEC 3432",
    "title": "Cyber Operations",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "CSEC 3432",
    "title": "Cyber Operations LAB",
    "hours": 2.2,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "SOEN 4463",
    "title": "Data Mining",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "SOEN 4463",
    "title": "Data Mining LAB",
    "hours": 2.2,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "GEIT 2421",
    "title": "Data Structures",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "GEIT 2421",
    "title": "Data Structures LAB",
    "hours": 2.2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "ITAP 4367",
    "title": "Database Administration",
    "hours": 3,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "GEIT 3341",
    "title": "Database I",
    "hours": 2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "GEIT 3341",
    "title": "Database I LAB",
    "hours": 2.2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "ITAP 3371",
    "title": "Database II",
    "hours": 2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP"
    ]
  },
  {
    "code": "ITAP 3371",
    "title": "Database II LAB",
    "hours": 2.2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP"
    ]
  },
  {
    "code": "AINT 3421",
    "title": "Deep Learning",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "AINT 3421",
    "title": "Deep Learning LAB",
    "hours": 2.2,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "COEN 3323",
    "title": "Digital and Logic Design",
    "hours": 2,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 3323",
    "title": "Digital and Logic Design LAB",
    "hours": 3.4,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "CSEC 2331",
    "title": "Digital Forensics",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "COEN 4322",
    "title": "Digital Signal Processing",
    "hours": 2,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 4322",
    "title": "Digital Signal Processing LAB",
    "hours": 3.4,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 4394",
    "title": "Digital Video Processing",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COSC 3332",
    "title": "Discrete Structures and Combinatorial Analysis",
    "hours": 3.4,
    "majors": [
      "COSC",
      "SOEN",
      "AINT"
    ]
  },
  {
    "code": "SOEN 3463",
    "title": "Distributed System",
    "hours": 3,
    "majors": [
      "SOEN",
      "AINT"
    ]
  },
  {
    "code": "SOEN 3463",
    "title": "Distributed System LAB",
    "hours": 2.2,
    "majors": [
      "SOEN",
      "AINT"
    ]
  },
  {
    "code": "COSC 4372",
    "title": "Distributed Systems in Algorithms",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "SOEN 4371",
    "title": "E-Commerce",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "COEN 3421",
    "title": "Electronics I",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 3421",
    "title": "Electronics I LAB",
    "hours": 3.4,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 4413",
    "title": "Embedded systems",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 4413",
    "title": "Embedded systems LAB",
    "hours": 2.2,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "ITAP 3383",
    "title": "Enterprise Resource Planning Systems",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "SOEN 3314",
    "title": "Formal Methods in Software Engineering",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "CSEC 4364",
    "title": "ICS/SCADA Security Essentials",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "ITAP 4390",
    "title": "Information Security and Assurance",
    "hours": 3,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "AINT 4381",
    "title": "Intelligent Robotics",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "CSEC 3354",
    "title": "Introduction to Cryptography",
    "hours": 3,
    "majors": [
      "COSC",
      "AINT",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "ITAP 1311",
    "title": "Introduction to Information Technology",
    "hours": 3,
    "majors": [
      "ITAP"
    ]
  },
  {
    "code": "AINT 3411",
    "title": "Introduction to Machine Learning",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "AINT 3411",
    "title": "Introduction to Machine Learning LAB",
    "hours": 2.2,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "AINT 2311",
    "title": "Introduction to AI",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "CSEC 1311",
    "title": "Introduction to Cybersecurity",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "ASSE 4311",
    "title": "Learning Outcome Assessment III AI",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "ASSE 4311",
    "title": "Learning Outcome Assessment III COE",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "ASSE 4311",
    "title": "Learning Outcome Assessment III IT",
    "hours": 3,
    "majors": [
      "ITAP"
    ]
  },
  {
    "code": "ASSE 4311",
    "title": "Learning Outcome Assessment III SE",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "ASSE 4311",
    "title": "Learning Outcome Assessment III CS",
    "hours": 3,
    "majors": [
      "COSC"
    ]
  },
  {
    "code": "ASSE 4311",
    "title": "Learning Outcome Assessment III CSEC",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "MATH 3433",
    "title": "Linear Algebra and Differential Equations",
    "hours": 5.4,
    "majors": [
      "COSC",
      "AINT",
      "COEN"
    ]
  },
  {
    "code": "COSC 3357",
    "title": "Logic and Formal Verification",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT"
    ]
  },
  {
    "code": "CSEC 4362",
    "title": "Machine Learning",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "GEIT 2331",
    "title": "Mathematical Reasoning and Algorithmic Thinking",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "COEN 4331",
    "title": "Microprocessors",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 4331",
    "title": "Microprocessors LAB",
    "hours": 3.3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "ITAP 3362",
    "title": "Mobile Applications Design and Development",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "COEN 4396",
    "title": "Modern Control Theory",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "AINT 4362",
    "title": "Multi Agent Systems",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "ITAP 4314",
    "title": "Multimedia Computing and Applications",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "ITAP 4362",
    "title": "Network Administration",
    "hours": 3,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "ITAP 2431",
    "title": "Network Management",
    "hours": 3,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "ITAP 2431",
    "title": "Network Management LAB",
    "hours": 3.4,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "CSEC 3431",
    "title": "Network Security",
    "hours": 3,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "CSEC 3431",
    "title": "Network Security LAB",
    "hours": 3.4,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "COSC 4361",
    "title": "Operating Systems",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "COSC 4365",
    "title": "Parallel Computing",
    "hours": 3,
    "majors": [
      "COSC",
      "AINT"
    ]
  },
  {
    "code": "ITAP 4364",
    "title": "Performance Analysis of Computer Networks",
    "hours": 3,
    "majors": [
      "ITAP"
    ]
  },
  {
    "code": "GEIT 4361",
    "title": "Practical Training",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "ITAP 3363",
    "title": "Principles of Open Source & Enterprise Computing with JAVA",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "GEIT 3351",
    "title": "Principles of Software Engneering",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "MATH 2313",
    "title": "Probability & Statistics",
    "hours": 4.4,
    "majors": [
      "COSC",
      "SOEN",
      "COEN"
    ]
  },
  {
    "code": "GEIT 2291",
    "title": "Professional Ethics",
    "hours": 2,
    "majors": [
      "COSC",
      "SOEN",
      "AINT",
      "ITAP",
      "CSEC",
      "COEN"
    ]
  },
  {
    "code": "SOEN 3321",
    "title": "Programming in UNIX Environments",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "COSC 4461",
    "title": "Programming Languages",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "COSC 4461",
    "title": "Programming Languages LAB",
    "hours": 3.4,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "COSC 4380",
    "title": "Quantum Information and Computation",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "AINT"
    ]
  },
  {
    "code": "SOEN 3311",
    "title": "Requirements Engineering",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "ITAP 4391",
    "title": "Reuse and Component-based Development",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "COEN 4397",
    "title": "Robotics",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "COEN 4397",
    "title": "Robotics LAB",
    "hours": 2.2,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "CSEC 3355",
    "title": "Scripting Languages",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "AINT 2412",
    "title": "Scripting Languages for AI",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "AINT 2412",
    "title": "Scripting Languages for AI LAB",
    "hours": 2.2,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "ITAP 4376",
    "title": "Secure E-Commerce",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "CSEC 3352",
    "title": "Secure Software Engineering",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "SOEN 4311",
    "title": "Software Architecture and Design",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "SOEN 4321",
    "title": "Software Maintenance and Evolution",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "SOEN 4313",
    "title": "Software Project Management",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "SOEN 4322",
    "title": "Software Security",
    "hours": 3,
    "majors": [
      "SOEN"
    ]
  },
  {
    "code": "SOEN 4312",
    "title": "Software Testing and Quality Assurance",
    "hours": 3,
    "majors": [
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "AINT 4393",
    "title": "Special Topics: Natural Language Processing",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "COSC 4393",
    "title": "Special Topics I Machine Learn",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN"
    ]
  },
  {
    "code": "COEN 4371",
    "title": "Synthesis with Hardware Description Languages",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  },
  {
    "code": "ITAP 4363",
    "title": "Systems Administration",
    "hours": 3,
    "majors": [
      "ITAP",
      "CSEC"
    ]
  },
  {
    "code": "ITAP 3411",
    "title": "Systems Programming",
    "hours": 3,
    "majors": [
      "COSC",
      "ITAP"
    ]
  },
  {
    "code": "ITAP 3411",
    "title": "Systems Programming LAB",
    "hours": 3.3,
    "majors": [
      "COSC",
      "ITAP"
    ]
  },
  {
    "code": "CSEC 4472",
    "title": "Systems Security",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "CSEC 4472",
    "title": "Systems Security LAB",
    "hours": 2.2,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "AINT 4374",
    "title": "Text Mining",
    "hours": 3,
    "majors": [
      "AINT"
    ]
  },
  {
    "code": "COSC 4363",
    "title": "Theory of Computation",
    "hours": 3,
    "majors": [
      "COSC"
    ]
  },
  {
    "code": "ITAP 3313",
    "title": "User Interface Development",
    "hours": 3,
    "majors": [
      "COSC",
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "CSEC 4471",
    "title": "Vulnerabiity and Penetration Testing",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "CSEC 4471",
    "title": "Vulnerabiity and Penetration Testing LAB",
    "hours": 2.2,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "CSEC 4363",
    "title": "Web Applications Penetration Testing",
    "hours": 3,
    "majors": [
      "CSEC"
    ]
  },
  {
    "code": "SOEN 2312",
    "title": "Web Programming",
    "hours": 2,
    "majors": [
      "COSC",
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "SOEN 2312",
    "title": "Web Programming LAB",
    "hours": 2.2,
    "majors": [
      "COSC",
      "SOEN",
      "ITAP"
    ]
  },
  {
    "code": "ITAP 3471",
    "title": "Web Server Administration",
    "hours": 3,
    "majors": [
      "ITAP"
    ]
  },
  {
    "code": "ITAP 3471",
    "title": "Web Server Administration LAB",
    "hours": 3.4,
    "majors": [
      "ITAP"
    ]
  },
  {
    "code": "COEN 4395",
    "title": "Wireless and Mobile Computing",
    "hours": 3,
    "majors": [
      "COEN"
    ]
  }
];

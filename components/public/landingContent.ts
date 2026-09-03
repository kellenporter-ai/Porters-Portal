export type PublicLang = 'en' | 'es';

const AP_PDFS_EN = [
  { href: '/assets/public-docs/ap-physics-1-course-overview.pdf', label: 'Course Overview' },
  { href: '/assets/public-docs/ap-physics-1-course-at-a-glance.pdf', label: 'Course at a Glance' },
  { href: '/assets/public-docs/ap-physics-1-course-and-exam-description.pdf', label: 'Course & Exam Description' },
];

const AP_PDFS_ES = [
  { href: '/assets/public-docs/ap-physics-1-course-overview.pdf', label: 'Resumen del Curso (en inglés)' },
  { href: '/assets/public-docs/ap-physics-1-course-at-a-glance.pdf', label: 'El Curso de un Vistazo (en inglés)' },
  { href: '/assets/public-docs/ap-physics-1-course-and-exam-description.pdf', label: 'Descripción del Curso y Examen (en inglés)' },
];

export const CONTENT = {
  en: {
    nav: {
      welcome: 'Welcome',
      courses: 'Courses',
      procedures: 'Procedures',
      contact: 'Contact',
      login: 'Student Login',
      toggleAria: 'Switch to Spanish version',
    },
    footer: {
      schoolAndRoom: 'Perth Amboy High School · Room B139',
      privacy: 'Privacy Policy',
      privacyHref: '/privacy',
    },
    hero: {
      badge: 'Physics & Forensic Science',
      title: "Porter's Portal",
      motto: 'Knowledge, empowers.',
      subtitle: "Mr. Porter's Physics & Forensics · Room B139, Perth Amboy High School",
      body: 'Welcome! I built this Portal as the one-stop home for my classes. Students: log in with your school Google account to access class resources, assignments, and assessments. Parents and guardians: everything below is for you: course information, class procedures, and how to reach me.',
      loginBtn: 'Student Login',
      coursesBtn: 'Explore Courses',
      loginBtnAria: 'Student login',
      coursesBtnAria: 'Explore courses',
    },
    courses: {
      h2: 'Courses',
      sub: 'What my students are learning this year, at a glance.',
      ap: {
        title: 'AP Physics 1',
        body: 'College-level, algebra-based physics following the College Board framework: motion, forces, energy, momentum, rotation, and circuits. Students learn by doing real science: observing, building models, and testing predictions.',
        downloadHeading: 'Download resources:',
        pdfs: AP_PDFS_EN,
        downloadAria: (label: string) => `${label} for AP Physics 1 (opens in new tab)`,
      },
      honors: {
        title: 'Honors & CP Physics',
        body: 'The core physics toolkit: motion, forces, energy, momentum, and waves. Honors moves deeper and faster; both levels emphasize mathematical modeling and lab investigation.',
        downloadHeading: 'Download resources:',
        pdfLabel: 'Physics Syllabus',
        downloadAria: 'Physics Syllabus for Honors & CP Physics (opens in new tab)',
      },
      forensic: {
        title: 'Forensic Science',
        body: 'The science behind solving crimes: fingerprints, toxicology, entomology, ballistics, and evidence analysis. Students work cases hands-on, from crime scene to conclusion.',
        downloadHeading: 'Download resources:',
        pdfLabel: 'Forensic Science Syllabus',
        downloadAria: 'Forensic Science Syllabus (opens in new tab)',
      },
      newTab: '(opens in new tab)',
    },
    procedures: {
      h2: 'Class Procedures',
      sub: 'What to expect, every day.',
      cells: {
        title: 'Cell phones (NJ law)',
        body: 'Cell phones must be off and away for the entire school day. This is now New Jersey state law. In my classroom, your phone goes OFF and into your assigned numbered pouch at the door, or stays OFF in your bag or backpack. A phone found in your possession during class is a violation of state law and may result in disciplinary action.',
      },
      seating: {
        title: 'Seating & table groups',
        body: 'Students sit in assigned table groups named after famous scientists: Curie, Einstein, Newton, Lovelace, Faraday, and Hopper. Group assignments are posted on day one and stay in effect all marking period.',
      },
      learning: {
        title: 'How my class learns',
        body: 'My class is collaborative. Students investigate, discuss, whiteboard, and present with their table group. Multiple attempts are always allowed. Mistakes are data, not disasters.',
      },
      portal: {
        title: 'The Portal',
        body: 'I post assignments, class resources, grades, and feedback here on the Portal. Students should check in daily.',
      },
      resubmit: {
        title: 'Resubmit and revise',
        p1: 'My expectation: students resubmit assignments until they reach the highest rubric mark they can. The goal is Developing on every skill. Almost all assignments can be resubmitted, and there is no penalty for late work.',
        p2: 'Each marking period has one final due date, typically 2 days before the marking period ends. Anything turned in before that date is graded without penalty.',
        p3: 'One caution: work piles up. Falling too far behind makes the amount feel impossible, so I encourage students to stay current.',
      },
      grading: {
        title: 'How my grading works',
        intro: 'Every skill is graded on a 5-level rubric. The levels describe how well a student can show the science and thinking skills we practice in class: careful observation, building models, supporting claims with evidence, and revising ideas when the evidence demands it.',
        tiers: [
          {
            name: 'Missing (0%):',
            desc: 'No evidence of the skill yet. The work is missing or shows no real attempt.',
          },
          {
            name: 'Emerging (55%):',
            desc: 'A first attempt. The student tries the skill, but the science is mostly incorrect or unsupported. This is the first draft of understanding.',
          },
          {
            name: 'Approaching (65%):',
            desc: 'Partway there. Pieces of correct science or reasoning are present, but important parts are missing or only partially supported by evidence.',
          },
          {
            name: 'Developing (85%):',
            desc: 'Solid work. The skill is shown correctly with only minor gaps, and the reasoning is mostly backed by evidence.',
          },
          {
            name: 'Refining (100%):',
            desc: 'Mastery. The skill is shown completely, and the student can extend it: clear explanations, connections between ideas, application to new situations.',
          },
        ],
      },
    },
    contact: {
      h2: 'Contact',
      sub: 'Questions about class? Reach out any time.',
      teacherLabel: 'Teacher',
      teacherValue: 'Mr. Kellen Porter, Physics & Forensic Science Teacher',
      emailLabel: 'Email',
      emailAria: 'Email Mr. Kellen Porter at kellporter2 at paps dot net',
      emailValue: 'kellporter2@paps.net',
      schoolLabel: 'School',
      schoolValue: 'Perth Amboy High School, 931 Convery Blvd, Perth Amboy, NJ 08861',
      mainOfficeLabel: 'Main office',
      mainOfficeAria: 'Call the main office at 7 3 2 3 7 6 6 2 3 0',
      mainOfficeValue: '(732) 376-6230',
    },
  },
  es: {
    nav: {
      welcome: 'Bienvenida',
      courses: 'Cursos',
      procedures: 'Reglas',
      contact: 'Contacto',
      login: 'Acceso de Estudiantes',
      toggleAria: 'Cambiar a la versión en inglés',
    },
    footer: {
      schoolAndRoom: 'Perth Amboy High School · Salón B139',
      privacy: 'Política de Privacidad (en inglés)',
      privacyHref: '/privacy',
    },
    hero: {
      badge: 'Física y Ciencias Forenses',
      title: "Porter's Portal",
      motto: 'Knowledge, empowers.',
      subtitle: 'Física y Ciencias Forenses del Sr. Porter · Salón B139, Perth Amboy High School',
      body: '¡Bienvenidos! Construí este Portal como el lugar central para mis clases. Estudiantes: inicien sesión con su cuenta de Google de la escuela para ver los recursos, las tareas y las evaluaciones. Padres y tutores: todo lo que sigue es para ustedes: información sobre los cursos, las reglas de la clase y cómo comunicarse conmigo.',
      loginBtn: 'Acceso de Estudiantes',
      coursesBtn: 'Ver los Cursos',
      loginBtnAria: 'Acceso de estudiantes',
      coursesBtnAria: 'Ver los cursos',
    },
    courses: {
      h2: 'Cursos',
      sub: 'Lo que mis estudiantes aprenden este año, de un vistazo.',
      ap: {
        title: 'AP Physics 1',
        body: 'Física de nivel universitario basada en álgebra, siguiendo el programa del College Board: movimiento, fuerzas, energía, momento, rotación y circuitos. Los estudiantes aprenden haciendo ciencia de verdad: observando, construyendo modelos y comprobando predicciones.',
        downloadHeading: 'Descargar documentos:',
        pdfs: AP_PDFS_ES,
        downloadAria: (label: string) => `${label} para AP Physics 1 (se abre en una pestaña nueva)`,
      },
      honors: {
        title: 'Honors & CP Physics',
        body: 'Las herramientas básicas de la física: movimiento, fuerzas, energía, momento y ondas. Honors avanza más profundo y más rápido; ambos niveles enfatizan los modelos matemáticos y la investigación de laboratorio.',
        downloadHeading: 'Descargar documentos:',
        pdfLabel: 'Programa de Física (en inglés)',
        downloadAria: 'Programa de Física para Honors & CP Physics (se abre en una pestaña nueva)',
      },
      forensic: {
        title: 'Forensic Science',
        body: 'La ciencia detrás de resolver crímenes: huellas dactilares, toxicología, entomología, balística y análisis de evidencia. Los estudiantes trabajan casos con sus propias manos, desde la escena del crimen hasta la conclusión.',
        downloadHeading: 'Descargar documentos:',
        pdfLabel: 'Programa de Ciencias Forenses (en inglés)',
        downloadAria: 'Programa de Ciencias Forenses (se abre en una pestaña nueva)',
      },
      newTab: '(se abre en una pestaña nueva)',
    },
    procedures: {
      h2: 'Reglas de la Clase',
      sub: 'Qué esperar, todos los días.',
      cells: {
        title: 'Teléfonos celulares (ley de NJ)',
        body: 'Los teléfonos celulares deben estar apagados y guardados durante todo el día escolar. Esta es ahora la ley del estado de Nueva Jersey. En mi salón, el teléfono se APAGA y se coloca en el bolsillo numerado asignado al entrar, o se queda APAGADO en la mochila. Si un estudiante tiene un teléfono en su posesión durante la clase, es una violación de la ley estatal y puede resultar en acción disciplinaria.',
      },
      seating: {
        title: 'Asientos y grupos de mesa',
        body: 'Los estudiantes se sientan en grupos de mesa asignados, nombrados por científicos famosos: Curie, Einstein, Newton, Lovelace, Faraday y Hopper. Los grupos se anuncian el primer día y duran todo el período de calificaciones.',
      },
      learning: {
        title: 'Cómo aprendemos en mi clase',
        body: 'Mi clase es colaborativa. Los estudiantes investigan, discuten, escriben en pizarras blancas y presentan con su grupo de mesa. Siempre se permiten varios intentos. Los errores son información, no desastres.',
      },
      portal: {
        title: 'El Portal',
        body: 'Publico las tareas, los recursos de la clase, las calificaciones y los comentarios aquí en el Portal. Los estudiantes deben revisarlo todos los días.',
      },
      resubmit: {
        title: 'Reentregar y mejorar',
        p1: 'Mi expectativa: los estudiantes reentregan las tareas hasta alcanzar la calificación más alta que puedan en la rúbrica. La meta es Developing en cada habilidad. Casi todas las tareas se pueden reentregar, y no hay penalización por trabajo atrasado.',
        p2: 'Cada período de calificaciones tiene una fecha límite final, normalmente 2 días antes de que termine el período. Todo lo que se entregue antes de esa fecha se califica sin penalización.',
        p3: 'Una advertencia: el trabajo se acumula. Atrasarse demasiado hace que la cantidad parezca imposible, así que animo a los estudiantes a mantenerse al día.',
      },
      grading: {
        title: 'Cómo califico',
        intro: 'Cada habilidad se califica con una rúbrica de 5 niveles. Los niveles describen qué tan bien el estudiante puede demostrar las habilidades de ciencia y razonamiento que practicamos en clase: observación cuidadosa, construcción de modelos, apoyar afirmaciones con evidencia y revisar ideas cuando la evidencia lo exige.',
        tiers: [
          {
            name: 'Missing (0%):',
            desc: 'Aún no hay evidencia de la habilidad. Falta el trabajo o no muestra un intento real.',
          },
          {
            name: 'Emerging (55%):',
            desc: 'Un primer intento. El estudiante intenta la habilidad, pero la ciencia es mayormente incorrecta o no está apoyada. Es el primer borrador del entendimiento.',
          },
          {
            name: 'Approaching (65%):',
            desc: 'A medio camino. Hay partes de ciencia o razonamiento correctos, pero faltan partes importantes o solo están parcialmente apoyadas por evidencia.',
          },
          {
            name: 'Developing (85%):',
            desc: 'Trabajo sólido. La habilidad se demuestra correctamente con solo errores menores, y el razonamiento está mayormente apoyado por evidencia.',
          },
          {
            name: 'Refining (100%):',
            desc: 'Dominio. La habilidad se demuestra por completo, y el estudiante puede ir más allá: explicaciones claras, conexiones entre ideas y aplicación a situaciones nuevas.',
          },
        ],
      },
    },
    contact: {
      h2: 'Contacto',
      sub: '¿Preguntas sobre mi clase? Escríbame cuando quiera.',
      teacherLabel: 'Maestro',
      teacherValue: 'Sr. Kellen Porter, Maestro de Física y Ciencias Forenses',
      emailLabel: 'Correo electrónico',
      emailAria: 'Enviar correo al Sr. Kellen Porter a kellporter2 arroba paps punto net',
      emailValue: 'kellporter2@paps.net',
      schoolLabel: 'Escuela',
      schoolValue: 'Perth Amboy High School, 931 Convery Blvd, Perth Amboy, NJ 08861',
      mainOfficeLabel: 'Oficina principal',
      mainOfficeAria: 'Llamar a la oficina principal al 7 3 2 3 7 6 6 2 3 0',
      mainOfficeValue: '(732) 376-6230',
    },
  },
};

export type LandingContent = (typeof CONTENT)['en'];

import type { AIHealthResult, AIProvider, AIProviderResult, AIRequest } from "./types";

export class LocalProvider implements AIProvider {
  readonly id = "local" as const;

  async isAvailable(): Promise<boolean> {
    return true; // Local fallback is always available
  }

  async generate(request: AIRequest): Promise<AIProviderResult> {
    const startTime = Date.now();
    const message = request.userMessage.toLowerCase();
    const docContext = request.legalContext || {};
    const pageContext = docContext.pageContext || {};
    const route = pageContext.route || "";

    const isPageQuery =
      message.includes("pestaña") ||
      message.includes("pantalla") ||
      message.includes("página") ||
      message.includes("hace esta") ||
      message.includes("donde estoy") ||
      message.includes("que hace") ||
      message.includes("sección");

    let content = "Análisis legal preliminar generado localmente por Jurídico Radar.\n\n";
    const activeCase = request.legalContext?.activeCase || null;
    const activeBulletin = request.legalContext?.activeBulletin || null;

    if (activeCase && message.includes('expediente')) {
      content =
        `📌 Estás sobre un expediente activo: ${activeCase.expedienteNumber || activeCase.caseId || 'Sin número'}.\n` +
        `Materia: ${activeCase.matter || 'No definida'}.\n` +
        `Órgano: ${activeCase.court || 'No especificado'}.\n` +
        `Puedo ayudarte a revisar plazos, partes y argumentos según ese expediente.`;
    } else if (activeBulletin && message.includes('boletín')) {
      content =
        `📌 Estás trabajando con un boletín judicial activo (${activeBulletin.sourceName || activeBulletin.subscriptionId}).\n` +
        `Expediente: ${activeBulletin.expediente || 'No definido'}.\n` +
        `Puedo ayudarte a contextualizar búsquedas y resultados en ese boletín.`;
    } else if (isPageQuery) {
      if (route === "/" || route === "" || route === "/index") {
        content =
          "📌 **Resumen de la pantalla actual (Dashboard / Inteligencia Regulatoria)**:\n\n" +
          "Te encuentras en el **Panel Principal de Inteligencia Regulatoria** de Jurídico Radar. En esta vista puedes:\n" +
          "• Monitorear publicaciones del Diario Oficial de la Federación (DOF), Periódico Oficial de Jalisco y Gacetas Oficiales.\n" +
          "• Consultar métricas de la plataforma (1,013 documentos legales analizados y procesados).\n" +
          "• Revisar el estado de las reglas activas de vigilancia y fuentes en monitoreo.\n" +
          "• Acceder a las herramientas de Búsqueda Avanzada, Monitoreo Legal, Centro Jurídico e IA Sandbox.";
      } else if (route.includes("/legal-hub/machotes")) {
        content =
          "📌 **Resumen de la pantalla actual (Generador de Machotes y Plantillas)**:\n\n" +
          "Te encuentras en la herramienta de **Generación de Machotes Legales**. Aquí puedes:\n" +
          "• Crear y estructurar escritos procesales (Amparo, Civil, Mercantil, Familiar).\n" +
          "• Subir y guardar tus propios machotes de despacho.\n" +
          "• Autollenar campos con IA desde descripciones o archivos PDF.\n" +
          "• Cargar datos de ejemplo y exportar a Word (DOCX) o PDF.";
      } else if (route.includes("/legal-hub/boletines")) {
        content =
          "📌 **Resumen de la pantalla actual (Boletines Judiciales)**:\n\n" +
          "Te encuentras en el módulo de **Seguimiento Automatizado de Boletines Judiciales**. Te permite dar seguimiento automático a expedientes, juzgados y partes promoventes.";
      } else {
        content =
          `📌 **Resumen de la pantalla actual (${pageContext.pageTitle || "Jurídico Radar"})**:\n\n` +
          `Te encuentras navegando en la sección ${route || "principal"}. En esta pantalla puedes gestionar la información jurídica del módulo activo.`;
      }
    } else if (
      docContext.templateName &&
      (message.includes("machote") || message.includes("documento") || message.includes("borrador"))
    ) {
      const title = docContext.templateName || "borrador de documento";
      content += `Revisión determinística del borrador "${title}":\n`;
      content += `1. Verificación estructural: El borrador conserva los apartados jurídicos requeridos.\n`;
      content += `2. Advertencia de validación: Verifique los campos marcados como pendientes y contraste con la legislación aplicable.\n`;
      content += `3. Fundamentación: Confirme artículos y tesis vigentes antes de su presentación.`;
    } else if (message.includes("reforma") || message.includes("cambio")) {
      content += `Orientación local sobre reformas legales:\n`;
      content += `1. Consulte el Diario Oficial de la Federación (DOF) o la Gaceta Oficial correspondiente.\n`;
      content += `2. Verifique la fecha de entrada en vigor en los artículos transitorios.`;
    } else {
      content +=
        "Orientación de Jurídico Radar:\n\n" +
        "Puedes realizar consultas sobre la pantalla o pestaña actual, consultar jurisprudencia del SJF, revisar reformas o generar escritos procesales.";
    }

    const latencyMs = Date.now() - startTime;

    return {
      provider: this.id,
      model: "local-deterministic-rules-v1",
      success: true,
      content,
      latencyMs,
      warnings: ["Respuesta generada mediante reglas locales determinísticas debido a la indisponibilidad de proveedores externos."],
      providerRequested: "nvidia",
      providerActuallyUsed: "local",
      fallbackReason: "NVIDIA_NO_API_KEY",
      origin: "LOCAL_PLACEHOLDER",
      isLegalAiContent: false,
    };
  }

  async healthCheck(): Promise<AIHealthResult> {
    return {
      provider: this.id,
      configured: true,
      available: true,
      model: "local-deterministic-rules-v1",
      lastCheckAt: new Date().toISOString(),
      latencyMs: 1,
      lastError: null,
    };
  }
}

export const localProviderInstance = new LocalProvider();

# INSTRUCCIONES ACTIVAS PARA CLAUDE

## VERIFICAR ANTES DE CADA RESPUESTA

### REGLA DE AGENTES PARALELOS x8

SI el usuario pide CREAR/DESARROLLAR/CONSTRUIR algo que requiera 3+ archivos:

1. ANUNCIAR: "Activando 8 agentes paralelos..."
2. MOSTRAR distribucion de agentes
3. LANZAR Agent() x8 en paralelo
4. INTEGRAR resultados
5. VERIFICAR compilacion

PALABRAS CLAVE QUE ACTIVAN:
- "Creame un/una..."
- "Hazme un/una..."
- "Desarrolla un/una..."
- "Construye un/una..."
- "Implementa un/una..."
- Cualquier proyecto/plugin/aplicacion/pagina web completa

ARCHIVOS ACTUALES EN PROYECTO: 31

SI fileCount < 5 Y usuario pide crear algo -> USAR AGENTES PARALELOS

// Session configuration helper for multi-instance Chrome debugging
export interface SessionConfig {
  chromeDebugPort: string;
  mcpServerPort: string; 
  chromeDebugUrl: string;
  chromeUserDir: string;
}

export function getSessionConfig(): SessionConfig {
  // Get ports from environment variables set by start-debug.bat
  const chromeDebugPort = process.env.CHROME_DEBUG_PORT || '9222';
  const mcpServerPort = process.env.MCP_SERVER_PORT || '3002';
  const chromeDebugUrl = process.env.CHROME_DEBUG_URL || `ws://localhost:${chromeDebugPort}`;
  const chromeUserDir = process.env.CHROME_USER_DIR || `C:\\temp\\chrome-debug-${chromeDebugPort}`;

  console.log('[SESSION_CONFIG] Using session configuration:', {
    chromeDebugPort,
    mcpServerPort,
    chromeDebugUrl,
    chromeUserDir
  });

  return {
    chromeDebugPort,
    mcpServerPort,
    chromeDebugUrl,
    chromeUserDir
  };
}

export function validateSessionConfig(): boolean {
  const config = getSessionConfig();
  
  // Check if we have the required environment variables
  const hasEnvVars = process.env.CHROME_DEBUG_PORT && process.env.MCP_SERVER_PORT;
  
  if (!hasEnvVars) {
    console.warn('[SESSION_CONFIG] ⚠️ Environment variables not set. Using default ports.');
    console.warn('[SESSION_CONFIG] 💡 Run start-debug.bat to set up proper session isolation.');
    return false;
  }

  console.log('[SESSION_CONFIG] ✅ Session configuration validated');
  return true;
}

export function logSessionInfo(): void {
  const config = getSessionConfig();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 VERIFICATION SESSION CONFIGURATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 Chrome Debug Port: ${config.chromeDebugPort}`);
  console.log(`🔌 MCP Server Port: ${config.mcpServerPort}`);
  console.log(`📁 Chrome User Dir: ${config.chromeUserDir}`);
  console.log(`🔗 Chrome Debug URL: ${config.chromeDebugUrl}`);
  console.log('ℹ️  Chrome launched with debug port enabled');
  console.log('ℹ️  Chrome configured to skip sign-in prompts');
  console.log('ℹ️  MCP and API listener both connect to same Chrome instance');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
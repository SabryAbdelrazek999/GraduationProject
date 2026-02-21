import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export const httpxService = {
  async scan(url: string) {
    try {
      const command = `/usr/local/bin/httpx-pd -u ${url} -json -title -status-code -tech-detect`;
      
      console.log(`[Httpx] Executing command...`);
      
      const { stdout, stderr } = await execPromise(command, { timeout: 15000 });
      
      if (stderr) {
        console.log(`[Httpx] Stderr (Warning/Info): ${stderr}`);
      }

      if (!stdout || stdout.trim() === '') {
        throw new Error("Command executed but returned empty output");
      }
      
      const result = JSON.parse(stdout.trim().split('\n')[0]); 
      
      return {
        isUp: true,
        statusCode: result['status_code'],
        webserver: result['tech'] ? result['tech'].join(', ') : result['webserver'] || 'Unknown',
        title: result['title'],
        contentType: result['content_type']
      };
    } catch (error: any) {
      console.error(`[Httpx] ❌ CRITICAL ERROR DETAILS:`);
      console.error(`   Message: ${error.message}`);
      if (error.stderr) console.error(`   Stderr: ${error.stderr}`);
      
      throw new Error(`Execution failed: ${error.message}`);
    }
  }
};
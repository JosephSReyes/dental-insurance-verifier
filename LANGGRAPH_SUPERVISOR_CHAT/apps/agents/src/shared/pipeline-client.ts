/**
 * Pipeline Client
 * Interfaces with the PreParser, Extractor, FieldNormalizer, and ValueNormalizer projects
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as fs from 'fs';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PipelineResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
}

/**
 * Base path for all pipeline projects (sibling to agent-chat-demo)
 */
const BASE_PATH = path.resolve(__dirname, '../../../../../..');

/**
 * Run PreParser project
 * Input: PortalAutomation downloads folder
 * Output: PreParser/outputs/{PATIENT_FOLDER}/markdown (folder containing markdown files)
 */
export async function runPreParser(patientFolder: string): Promise<PipelineResult> {
  console.log(`[PREPARSER] Running PreParser for patient folder: ${patientFolder}`);

  const projectPath = path.join(BASE_PATH, 'PreParser');
  const inputPath = path.join(BASE_PATH, 'PortalAutomation', 'downloads', patientFolder);
  const outputDir = path.join(projectPath, 'outputs');
  const outputPath = path.join(outputDir, patientFolder, 'markdown');

  console.log(`[PREPARSER] Project path: ${projectPath}`);
  console.log(`[PREPARSER] Input path: ${inputPath}`);
  console.log(`[PREPARSER] Output directory: ${outputDir}`);
  console.log(`[PREPARSER] Expected output folder: ${outputPath}`);

  // Verify input folder exists
  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      error: `Input folder does not exist: ${inputPath}`
    };
  }

  return new Promise((resolve) => {
    try {
      // Spawn Python process to run PreParser with CLI arguments
      // Usage: python main.py --input-dir "path" --output-dir "path" --docling
      const pythonProcess = spawn('python', [
        'main.py',
        '--input-dir', inputPath,
        '--output-dir', outputDir,
        '--docling'
      ], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[PREPARSER] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[PREPARSER] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[PREPARSER] Process exited with code ${code}`);
        console.log(`[PREPARSER] === STDOUT ===`);
        console.log(stdout || '(empty)');
        console.log(`[PREPARSER] === STDERR ===`);
        console.log(stderr || '(empty)');

        if (code !== 0) {
          console.error(`[PREPARSER] Command: python main.py --input-dir "${inputPath}" --output-dir "${outputDir}" --docling`);
          console.error(`[PREPARSER] Working directory: ${projectPath}`);
          resolve({
            success: false,
            error: `PreParser process failed with code ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify output folder was created
        if (!fs.existsSync(outputPath)) {
          resolve({
            success: false,
            error: `PreParser completed but output folder not found: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify it's a directory
        if (!fs.statSync(outputPath).isDirectory()) {
          resolve({
            success: false,
            error: `PreParser output path exists but is not a directory: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        console.log(`[PREPARSER] Success! Output folder: ${outputPath}`);
        resolve({
          success: true,
          outputPath,
          stdout,
          stderr
        });
      });

      pythonProcess.on('error', (error) => {
        console.error(`[PREPARSER] Failed to start process:`, error);
        resolve({
          success: false,
          error: error.message
        });
      });

    } catch (error) {
      console.error(`[PREPARSER] Exception:`, error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

/**
 * Run Extractor project
 * Input: PreParser output folder (containing markdown files)
 * Output: Extractor/outputs/{PATIENT_FOLDER}/extractor_results.jsonl
 */
export async function runExtractor(patientFolder: string, preParserOutputPath: string): Promise<PipelineResult> {
  console.log(`[EXTRACTOR] Running Extractor for patient folder: ${patientFolder}`);

  const projectPath = path.join(BASE_PATH, 'Extractor');
  const outputPath = path.join(projectPath, 'outputs', patientFolder, 'extractor_results.jsonl');

  // PreParser now outputs a markdown folder, so we need the parent folder (patient folder)
  const preParserOutputDir = path.dirname(preParserOutputPath);

  console.log(`[EXTRACTOR] Project path: ${projectPath}`);
  console.log(`[EXTRACTOR] Input folder: ${preParserOutputDir}`);
  console.log(`[EXTRACTOR] PreParser markdown folder: ${preParserOutputPath}`);
  console.log(`[EXTRACTOR] Expected output: ${outputPath}`);

  // Verify patient folder exists
  if (!fs.existsSync(preParserOutputDir)) {
    return {
      success: false,
      error: `Patient folder does not exist: ${preParserOutputDir}`
    };
  }

  // Verify markdown folder exists
  if (!fs.existsSync(preParserOutputPath)) {
    return {
      success: false,
      error: `PreParser markdown folder does not exist: ${preParserOutputPath}`
    };
  }

  return new Promise((resolve) => {
    try {
      // Spawn Python process to run Extractor
      // Usage: python main.py --patient-folder "path/to/folder"
      const pythonProcess = spawn('python', ['main.py', '--patient-folder', preParserOutputDir], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[EXTRACTOR] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[EXTRACTOR] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[EXTRACTOR] Process exited with code ${code}`);

        if (code !== 0) {
          resolve({
            success: false,
            error: `Extractor process failed with code ${code}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify output file was created
        if (!fs.existsSync(outputPath)) {
          resolve({
            success: false,
            error: `Extractor completed but output file not found: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        console.log(`[EXTRACTOR] Success! Output: ${outputPath}`);
        resolve({
          success: true,
          outputPath,
          stdout,
          stderr
        });
      });

      pythonProcess.on('error', (error) => {
        console.error(`[EXTRACTOR] Failed to start process:`, error);
        resolve({
          success: false,
          error: error.message
        });
      });

    } catch (error) {
      console.error(`[EXTRACTOR] Exception:`, error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

/**
 * Run FieldNormalizer project
 * Input: Extractor output file
 * Output: FieldNormalizer/outputs/{PATIENT_FOLDER}/field_normalizer_results.jsonl
 */
export async function runFieldNormalizer(patientFolder: string, extractorOutputPath: string): Promise<PipelineResult> {
  console.log(`[FIELD_NORMALIZER] Running FieldNormalizer for patient folder: ${patientFolder}`);

  const projectPath = path.join(BASE_PATH, 'FieldNormalizer');
  const outputPath = path.join(projectPath, 'outputs', patientFolder, 'field_normalizer_results.jsonl');

  console.log(`[FIELD_NORMALIZER] Project path: ${projectPath}`);
  console.log(`[FIELD_NORMALIZER] Input file: ${extractorOutputPath}`);
  console.log(`[FIELD_NORMALIZER] Expected output: ${outputPath}`);

  // Verify input file exists
  if (!fs.existsSync(extractorOutputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${extractorOutputPath}`
    };
  }

  return new Promise((resolve) => {
    try {
      // Spawn Python process to run FieldNormalizer
      // Usage: python main.py --input "path/to/extractor_results.jsonl"
      const pythonProcess = spawn('python', ['main.py', '--input', extractorOutputPath], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[FIELD_NORMALIZER] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[FIELD_NORMALIZER] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[FIELD_NORMALIZER] Process exited with code ${code}`);

        if (code !== 0) {
          resolve({
            success: false,
            error: `FieldNormalizer process failed with code ${code}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify output file was created
        if (!fs.existsSync(outputPath)) {
          resolve({
            success: false,
            error: `FieldNormalizer completed but output file not found: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        console.log(`[FIELD_NORMALIZER] Success! Output: ${outputPath}`);
        resolve({
          success: true,
          outputPath,
          stdout,
          stderr
        });
      });

      pythonProcess.on('error', (error) => {
        console.error(`[FIELD_NORMALIZER] Failed to start process:`, error);
        resolve({
          success: false,
          error: error.message
        });
      });

    } catch (error) {
      console.error(`[FIELD_NORMALIZER] Exception:`, error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

/**
 * Run ValueNormalizer project
 * Input: FieldNormalizer output file
 * Output: ValueNormalizer/outputs/{PATIENT_FOLDER}/value_normalizer_results.jsonl
 */
export async function runValueNormalizer(patientFolder: string, fieldNormalizerOutputPath: string): Promise<PipelineResult> {
  console.log(`[VALUE_NORMALIZER] Running ValueNormalizer for patient folder: ${patientFolder}`);

  const projectPath = path.join(BASE_PATH, 'ValueNormalizer');
  const outputPath = path.join(projectPath, 'outputs', patientFolder, 'value_normalizer_results.jsonl');

  console.log(`[VALUE_NORMALIZER] Project path: ${projectPath}`);
  console.log(`[VALUE_NORMALIZER] Input file: ${fieldNormalizerOutputPath}`);
  console.log(`[VALUE_NORMALIZER] Expected output: ${outputPath}`);

  // Verify input file exists
  if (!fs.existsSync(fieldNormalizerOutputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${fieldNormalizerOutputPath}`
    };
  }

  return new Promise((resolve) => {
    try {
      // Spawn Python process to run ValueNormalizer
      // Usage: python main.py --input "path/to/field_normalizer_results.jsonl"
      const pythonProcess = spawn('python', ['main.py', '--input', fieldNormalizerOutputPath], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[VALUE_NORMALIZER] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[VALUE_NORMALIZER] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[VALUE_NORMALIZER] Process exited with code ${code}`);

        if (code !== 0) {
          resolve({
            success: false,
            error: `ValueNormalizer process failed with code ${code}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify output file was created
        if (!fs.existsSync(outputPath)) {
          resolve({
            success: false,
            error: `ValueNormalizer completed but output file not found: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        console.log(`[VALUE_NORMALIZER] Success! Output: ${outputPath}`);
        resolve({
          success: true,
          outputPath,
          stdout,
          stderr
        });
      });

      pythonProcess.on('error', (error) => {
        console.error(`[VALUE_NORMALIZER] Failed to start process:`, error);
        resolve({
          success: false,
          error: error.message
        });
      });

    } catch (error) {
      console.error(`[VALUE_NORMALIZER] Exception:`, error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

/**
 * Run Simplifier project
 * Input: ValueNormalizer output file
 * Output: Simplifier/outputs/{PATIENT_FOLDER}/simplifier_results.txt
 */
export async function runSimplifier(patientFolder: string, valueNormalizerOutputPath: string): Promise<PipelineResult> {
  console.log(`[SIMPLIFIER] Running Simplifier for patient folder: ${patientFolder}`);

  const projectPath = path.join(BASE_PATH, 'Simplifier');
  const outputPath = path.join(projectPath, 'outputs', patientFolder, 'simplifier_results.txt');

  console.log(`[SIMPLIFIER] Project path: ${projectPath}`);
  console.log(`[SIMPLIFIER] Input file: ${valueNormalizerOutputPath}`);
  console.log(`[SIMPLIFIER] Expected output: ${outputPath}`);

  // Verify input file exists
  if (!fs.existsSync(valueNormalizerOutputPath)) {
    return {
      success: false,
      error: `Input file does not exist: ${valueNormalizerOutputPath}`
    };
  }

  return new Promise((resolve) => {
    try {
      // Spawn Python process to run Simplifier
      // Usage: python main.py --input "path/to/value_normalizer_results.jsonl"
      const pythonProcess = spawn('python', ['main.py', '--input', valueNormalizerOutputPath], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[SIMPLIFIER] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[SIMPLIFIER] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[SIMPLIFIER] Process exited with code ${code}`);

        if (code !== 0) {
          resolve({
            success: false,
            error: `Simplifier process failed with code ${code}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify output file was created
        if (!fs.existsSync(outputPath)) {
          resolve({
            success: false,
            error: `Simplifier completed but output file not found: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        console.log(`[SIMPLIFIER] Success! Output: ${outputPath}`);
        resolve({
          success: true,
          outputPath,
          stdout,
          stderr
        });
      });

      pythonProcess.on('error', (error) => {
        console.error(`[SIMPLIFIER] Failed to start process:`, error);
        resolve({
          success: false,
          error: error.message
        });
      });

    } catch (error) {
      console.error(`[SIMPLIFIER] Exception:`, error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

/**
 * Run Chunker project
 * Input: PreParser markdown directory (containing .md files from Docling)
 * Output: Chunker/outputs/{PATIENT_FOLDER}/markdown (directory containing chunked .md files)
 */
export async function runChunker(patientFolder: string, markdownDirPath: string): Promise<PipelineResult> {
  console.log(`[CHUNKER] Running Chunker for patient folder: ${patientFolder}`);

  const projectPath = path.join(BASE_PATH, 'Chunker');
  const outputDir = path.join(projectPath, 'outputs');
  const outputPath = path.join(outputDir, patientFolder, 'markdown');

  console.log(`[CHUNKER] Project path: ${projectPath}`);
  console.log(`[CHUNKER] Input markdown directory: ${markdownDirPath}`);
  console.log(`[CHUNKER] Output directory: ${outputDir}`);
  console.log(`[CHUNKER] Expected output folder: ${outputPath}`);

  // Verify input directory exists
  if (!fs.existsSync(markdownDirPath)) {
    return {
      success: false,
      error: `Input markdown directory does not exist: ${markdownDirPath}`
    };
  }

  // Verify it's a directory
  if (!fs.statSync(markdownDirPath).isDirectory()) {
    return {
      success: false,
      error: `Input path exists but is not a directory: ${markdownDirPath}`
    };
  }

  return new Promise((resolve) => {
    try {
      // Spawn Python process to run Chunker
      // Usage: python main.py --markdown-dir "path/to/input/markdown" --output-dir "path/to/output"
      const pythonProcess = spawn('python', [
        'main.py',
        '--markdown-dir', markdownDirPath,
        '--output-dir', outputDir
      ], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[CHUNKER] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[CHUNKER] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[CHUNKER] Process exited with code ${code}`);
        console.log(`[CHUNKER] === STDOUT ===`);
        console.log(stdout || '(empty)');
        console.log(`[CHUNKER] === STDERR ===`);
        console.log(stderr || '(empty)');

        if (code !== 0) {
          console.error(`[CHUNKER] Command: python main.py --markdown-dir "${markdownDirPath}" --output-dir "${outputDir}"`);
          console.error(`[CHUNKER] Working directory: ${projectPath}`);
          resolve({
            success: false,
            error: `Chunker process failed with code ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify output folder was created
        if (!fs.existsSync(outputPath)) {
          resolve({
            success: false,
            error: `Chunker completed but output folder not found: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        // Verify it's a directory
        if (!fs.statSync(outputPath).isDirectory()) {
          resolve({
            success: false,
            error: `Chunker output path exists but is not a directory: ${outputPath}`,
            stdout,
            stderr
          });
          return;
        }

        console.log(`[CHUNKER] Success! Output folder: ${outputPath}`);
        resolve({
          success: true,
          outputPath,
          stdout,
          stderr
        });
      });

      pythonProcess.on('error', (error) => {
        console.error(`[CHUNKER] Failed to start process:`, error);
        resolve({
          success: false,
          error: error.message
        });
      });

    } catch (error) {
      console.error(`[CHUNKER] Exception:`, error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

/**
 * Run Embedder project
 * Input: PreParser markdown directory (containing .md files from Docling)
 * Output: Stored in PostgreSQL database (no file output)
 */
export async function runEmbedder(patientFolder: string, markdownDirPath: string): Promise<PipelineResult> {
  console.log(`[EMBEDDER] Running Embedder for patient folder: ${patientFolder}`);

  const projectPath = path.join(BASE_PATH, 'Embedder');

  console.log(`[EMBEDDER] Project path: ${projectPath}`);
  console.log(`[EMBEDDER] Input markdown directory: ${markdownDirPath}`);
  console.log(`[EMBEDDER] Output: PostgreSQL database (no file output)`);

  // Verify input directory exists
  if (!fs.existsSync(markdownDirPath)) {
    return {
      success: false,
      error: `Input markdown directory does not exist: ${markdownDirPath}`
    };
  }

  // Verify it's a directory
  if (!fs.statSync(markdownDirPath).isDirectory()) {
    return {
      success: false,
      error: `Input path exists but is not a directory: ${markdownDirPath}`
    };
  }

  return new Promise((resolve) => {
    try {
      // Spawn Python process to run Embedder
      // Usage: python main.py --markdown-dir "path/to/markdown"
      const pythonProcess = spawn('python', ['main.py', '--markdown-dir', markdownDirPath], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        console.log(`[EMBEDDER] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        console.error(`[EMBEDDER] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        console.log(`[EMBEDDER] Process exited with code ${code}`);

        if (code !== 0) {
          resolve({
            success: false,
            error: `Embedder process failed with code ${code}`,
            stdout,
            stderr
          });
          return;
        }

        // Embedder stores data in PostgreSQL - no file output to verify
        // Success is determined by exit code 0
        console.log(`[EMBEDDER] Success! Embeddings stored in PostgreSQL database`);
        resolve({
          success: true,
          outputPath: 'STORED_IN_POSTGRESQL',
          stdout,
          stderr
        });
      });

      pythonProcess.on('error', (error) => {
        console.error(`[EMBEDDER] Failed to start process:`, error);
        resolve({
          success: false,
          error: error.message
        });
      });

    } catch (error) {
      console.error(`[EMBEDDER] Exception:`, error);
      resolve({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

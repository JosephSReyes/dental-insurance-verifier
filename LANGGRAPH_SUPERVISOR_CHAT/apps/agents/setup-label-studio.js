/**
 * Label Studio Project Setup Script
 * Creates project, imports verification data, and customizes theme
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LABEL_STUDIO_URL = process.env.LABEL_STUDIO_URL || 'http://localhost:8081';
const API_KEY = process.env.LABEL_STUDIO_API_KEY || 'your-label-studio-api-key';

// Custom theme matching your review page colors
const CUSTOM_THEME = {
  primaryColor: '#673499',      // Purple primary
  secondaryColor: '#63DAE0',    // Cyan
  accentColor: '#0ED11C',       // Green
  backgroundColor: '#0f172a',   // Slate-950
  cardBackground: '#1e293b',    // Slate-900
  textColor: '#f1f5f9',         // Slate-100
};

// Label Studio labeling configuration (XML)
const LABEL_CONFIG = `<View>
  <Header value="Dental Insurance Verification Review"/>

  <Text name="patient_data" value="$patient_full_name"/>
  <Text name="insurance_data" value="$insurance_company"/>
  <Text name="coverage_data" value="$preventive_coverage"/>

  <Header value="Validation Questions"/>

  <Choices name="patient_info" toName="patient_data" choice="single" required="true">
    <Choice value="correct"/>
    <Choice value="incorrect"/>
    <Choice value="needs_verification"/>
  </Choices>

  <Choices name="coverage_info" toName="coverage_data" choice="single" required="true">
    <Choice value="correct"/>
    <Choice value="incorrect"/>
    <Choice value="needs_verification"/>
  </Choices>

  <TextArea name="corrections" toName="patient_data" placeholder="Enter corrections..." rows="4"/>
  <TextArea name="notes" toName="patient_data" placeholder="Additional notes..." rows="3"/>

  <Rating name="confidence" toName="patient_data" maxRating="5" icon="star"/>
</View>`;

async function apiCall(endpoint, method = 'GET', body = null) {
  const url = `${LABEL_STUDIO_URL}/api${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`[API] ${method} ${endpoint}`);
  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API call failed: ${response.status} ${response.statusText}\n${text}`);
  }

  return await response.json();
}

async function createProject() {
  console.log('\n📋 Creating Label Studio project...');

  const project = await apiCall('/projects/', 'POST', {
    title: 'Dental Insurance Verification Review',
    description: 'Human review and validation of AI-extracted insurance verification data',
    label_config: LABEL_CONFIG,
    color: CUSTOM_THEME.primaryColor,
    show_instruction: true,
    instruction: `
# Verification Review Guidelines

## Your Task
Review AI-extracted insurance verification data and validate accuracy.

## Validation Steps
1. **Check Patient Info**: Verify name, DOB, and insurance details match
2. **Check Coverage**: Validate percentages, maximums, and deductibles
3. **Check Benefits**: Ensure yearly max, deductible used, and remaining benefits are accurate

## Marking Fields
- ✅ **Correct**: Field is accurate, no changes needed
- ❌ **Incorrect**: Field has errors, provide correction in notes
- ⚠️ **Needs Verification**: Uncertain, requires additional verification

## Hotkeys
- **1** = Mark as Correct
- **2** = Mark as Incorrect
- **3** = Needs Verification
- **Tab** = Next field
    `.trim()
  });

  console.log(`✅ Project created: ${project.title} (ID: ${project.id})`);
  return project;
}

async function importVerificationData(projectId) {
  console.log('\n📥 Importing verification data...');

  // Find the most recent verification
  const patientDataDir = path.join(__dirname, 'patient_data');
  const folders = fs.readdirSync(patientDataDir).filter(f => {
    return fs.statSync(path.join(patientDataDir, f)).isDirectory();
  });

  if (folders.length === 0) {
    console.log('⚠️  No patient data folders found');
    return;
  }

  // Sort by timestamp (folder names contain timestamps)
  folders.sort().reverse();
  const latestFolder = folders[0];
  const folderPath = path.join(patientDataDir, latestFolder);

  console.log(`📂 Using latest verification: ${latestFolder}`);

  // Load verification data
  const formFiles = fs.readdirSync(folderPath).filter(f => f.startsWith('verification_') && f.endsWith('.json'));

  if (formFiles.length === 0) {
    console.log('⚠️  No verification JSON found in folder');
    return;
  }

  const verificationPath = path.join(folderPath, formFiles[0]);
  const verification = JSON.parse(fs.readFileSync(verificationPath, 'utf-8'));

  console.log(`📄 Loaded verification for: ${verification.patient_full_name}`);

  // Create Label Studio task
  const task = {
    data: {
      patient_full_name: verification.patient_full_name || 'N/A',
      patient_dob: verification.patient_dob || 'N/A',
      insurance_company: verification.insurance_company || 'N/A',
      plan_name: verification.plan_name || 'N/A',
      preventive_coverage: verification.preventive_coverage || 'N/A',
      basic_coverage: verification.basic_coverage || 'N/A',
      major_coverage: verification.major_coverage || 'N/A',
      yearly_maximum: verification.yearly_maximum || 'N/A',
      yearly_maximum_used: verification.yearly_maximum_used || 'N/A',
      yearly_deductible: verification.yearly_deductible || 'N/A',
      yearly_deductible_used: verification.yearly_deductible_used || 'N/A',
      verification_id: latestFolder,
    },
    meta: {
      source: 'AI Verification System',
      timestamp: new Date().toISOString(),
      folder: latestFolder,
    }
  };

  const imported = await apiCall(`/projects/${projectId}/tasks/`, 'POST', task);
  console.log(`✅ Task imported (ID: ${imported.id})`);

  // Import 2 more verifications if available
  for (let i = 1; i < Math.min(3, folders.length); i++) {
    const folder = folders[i];
    const folderPath2 = path.join(patientDataDir, folder);
    const formFiles2 = fs.readdirSync(folderPath2).filter(f => f.startsWith('verification_') && f.endsWith('.json'));

    if (formFiles2.length > 0) {
      const verificationPath2 = path.join(folderPath2, formFiles2[0]);
      const verification2 = JSON.parse(fs.readFileSync(verificationPath2, 'utf-8'));

      const task2 = {
        data: {
          patient_full_name: verification2.patient_full_name || 'N/A',
          patient_dob: verification2.patient_dob || 'N/A',
          insurance_company: verification2.insurance_company || 'N/A',
          plan_name: verification2.plan_name || 'N/A',
          preventive_coverage: verification2.preventive_coverage || 'N/A',
          basic_coverage: verification2.basic_coverage || 'N/A',
          major_coverage: verification2.major_coverage || 'N/A',
          yearly_maximum: verification2.yearly_maximum || 'N/A',
          yearly_maximum_used: verification2.yearly_maximum_used || 'N/A',
          yearly_deductible: verification2.yearly_deductible || 'N/A',
          yearly_deductible_used: verification2.yearly_deductible_used || 'N/A',
          verification_id: folder,
        },
        meta: {
          source: 'AI Verification System',
          timestamp: new Date().toISOString(),
          folder: folder,
        }
      };

      const imported2 = await apiCall(`/projects/${projectId}/tasks/`, 'POST', task2);
      console.log(`✅ Task imported (ID: ${imported2.id}) - ${verification2.patient_full_name}`);
    }
  }
}

async function customizeTheme(projectId) {
  console.log('\n🎨 Customizing theme...');

  // Update project with custom colors
  await apiCall(`/projects/${projectId}/`, 'PATCH', {
    color: CUSTOM_THEME.primaryColor,
  });

  console.log('✅ Theme colors applied');
  console.log('   Primary:', CUSTOM_THEME.primaryColor);
  console.log('   Secondary:', CUSTOM_THEME.secondaryColor);
  console.log('   Accent:', CUSTOM_THEME.accentColor);
}

async function main() {
  console.log('🚀 Label Studio Setup Script');
  console.log('================================\n');

  try {
    // Step 1: Create project
    const project = await createProject();

    // Step 2: Import verification data
    await importVerificationData(project.id);

    // Step 3: Customize theme
    await customizeTheme(project.id);

    console.log('\n✅ Setup complete!');
    console.log(`\n🌐 Open Label Studio: ${LABEL_STUDIO_URL}/projects/${project.id}`);
    console.log('\n📝 Instructions:');
    console.log('   1. Open the URL above in your browser');
    console.log('   2. Click on any task to start annotating');
    console.log('   3. Use hotkeys: 1=Correct, 2=Incorrect, 3=Needs Verification');
    console.log('   4. Add corrections in the text areas');
    console.log('   5. Submit your annotations');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

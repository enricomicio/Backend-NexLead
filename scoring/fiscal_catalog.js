// scoring/fiscal_catalog.js
module.exports = [
  { id:'thomson_onesource', name:'Thomson Reuters ONESOURCE (Mastersaf)', tier:'enterprise',
    tags:['sap','oracle','multiempresa','multinacional','complexo','sped','enterprise'],
    keywords:['mastersaf','onesource','thomson reuters'] },

  { id:'sovos', name:'Sovos', tier:'enterprise',
    tags:['sap','oracle','multinacional','sped','enterprise','cloud'],
    keywords:['sovos'] },

  { id:'avalara', name:'Avalara', tier:'mid',
    tags:['e-commerce','saas','integracoes','nf-e','cloud','mid'],
    keywords:['avalara'] },

  // ⚠️ sap_only (regra também aplicada no scoring.js)
  { id:'guepardo', name:'Guepardo (NTT DATA)', tier:'enterprise',
    tags:['sap','brasil','sped','sap_only','enterprise'],
    keywords:['guepardo'] },

  // ⚠️ sap_only (regra também aplicada no scoring.js)
  { id:'4tax', name:'4Tax (Seidor)', tier:'mid',
    tags:['sap','brasil','sped','sap_only','mid'],
    keywords:['4tax'] },

  { id:'synchro', name:'Synchro', tier:'enterprise',
    tags:['brasil','sped','multiempresa','enterprise'],
    keywords:['synchro'] },

  { id:'dootax', name:'Dootax', tier:'mid',
    tags:['guias','boletos','automação fiscal','pagamento de tributos','mid'],
    keywords:['dootax'] },

  { id:'nfeio', name:'NFe.io', tier:'smb',
    tags:['nf-e','smb'],
    keywords:['nfe.io','nfeio'] },

  { id:'bpo_fiscal', name:'BPO Fiscal (terceirização)', tier:'varia',
    tags:['serviço'],
    keywords:['bpo fiscal','terceirização'] },

  { id:'planilhas', name:'Planilhas/house', tier:'smb',
    tags:['início','baixo volume','smb'],
    keywords:['planilha','excel'] },
];


// erp_catalog.js
module.exports = [
  { id:'sap_s4', name:'SAP S/4HANA', tier:'enterprise',
    sizeHint:{ minEmp: 800 }, tags:['multiempresa','consolidação','multi-moeda','complexo'],
    keywords:['s/4hana','sap s4','sap s/4','abap','sap hana'] },

  { id:'sap_ecc', name:'SAP ECC', tier:'enterprise',
    sizeHint:{ minEmp: 800 }, tags:['legado','multiempresa','complexo'],
    keywords:['sap ecc'] },

  { id:'sap_b1', name:'SAP Business One', tier:'smb',
    sizeHint:{ maxEmp: 500 }, tags:['pme','distribuição','varejo'],
    keywords:['sap business one','b1'] },

  { id:'oracle_netsuite', name:'Oracle NetSuite', tier:'mid',
    sizeHint:{ minEmp: 100, maxEmp: 1500 }, tags:['cloud','multi-entidade','saas'],
    keywords:['netsuite'] },

  { id:'d365_fo', name:'Dynamics 365 Finance & Operations', tier:'enterprise',
    sizeHint:{ minEmp: 600 }, tags:['azure','multi-entidade','governança'],
    keywords:['dynamics 365 finance','d365 fo','finance and operations'] },

  { id:'d365_bc', name:'Dynamics 365 Business Central', tier:'smb',
    sizeHint:{ maxEmp: 600 }, tags:['smb','azure','distribuição'],
    keywords:['business central','d365 bc'] },

  { id:'totvs_protheus', name:'TOTVS Protheus', tier:'mid',
    sizeHint:{ minEmp: 80, maxEmp: 3000 }, tags:['brasil','fiscal forte','manufatura','serviços'],
    keywords:['protheus','totvs'] },

  { id:'totvs_rm', name:'TOTVS RM', tier:'mid',
    sizeHint:{ minEmp: 50, maxEmp: 2000 }, tags:['serviços','educação','saúde','brasil'],
    keywords:['totvs rm'] },

  { id:'senior', name:'Senior', tier:'mid',
    sizeHint:{ minEmp: 100, maxEmp: 3000 }, tags:['manufatura','rh forte','brasil'],
    keywords:['senior sistemas','senior erp'] },

  { id:'sankhya', name:'Sankhya', tier:'mid',
    sizeHint:{ minEmp: 50, maxEmp: 2000 }, tags:['distribuição','serviços','indústria média','brasil'],
    keywords:['sankhya'] },

  { id:'omie', name:'Omie', tier:'smb',
    sizeHint:{ maxEmp: 200 }, tags:['micro e pequenas','serviços','saas'],
    keywords:['omie'] },

  { id:'tiny', name:'Tiny ERP', tier:'smb',
    sizeHint:{ maxEmp: 100 }, tags:['micro','e-commerce'],
    keywords:['tiny erp','tiny'] },

  { id:'custom', name:'Desenvolvimento próprio', tier:'varia',
    sizeHint:{}, tags:['in-house','legado'],
    keywords:['sistema próprio','in house','desenvolvimento próprio','house'] },
];

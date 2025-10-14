// scoring/erp_catalog.js
module.exports = [
  { id:'sap_s4', name:'SAP S/4HANA', tier:'enterprise',
    sizeHint:{ minEmp: 600 }, revHint:[500e6, 5e9],
    tags:['multiempresa','multi-moeda','complexo','enterprise','global','manufatura','financials'],
    keywords:['s/4hana','sap s4','sap s/4','abap','sap hana'] },

  { id:'sap_ecc', name:'SAP ECC', tier:'enterprise',
    sizeHint:{ minEmp: 600 }, revHint:[500e6, 5e9],
    tags:['legado','multiempresa','complexo','enterprise','global','manufatura','financials'],
    keywords:['sap ecc'] },

  { id:'sap_b1', name:'SAP Business One', tier:'smb',
    sizeHint:{ maxEmp: 400 }, revHint:[20e6, 600e6],
    tags:['smb','distribuição','varejo','serviços','brasil'],
    keywords:['sap business one','b1'] },

  { id:'oracle_fusion', name:'Oracle Fusion Cloud ERP', tier:'enterprise',
    sizeHint:{ minEmp: 600 }, revHint:[500e6, 5e9],
    tags:['cloud','saas','multiempresa','multi-moeda','enterprise','global','financials'],
    keywords:['oracle fusion','fusion cloud erp','oracle erp cloud'] },

  { id:'oracle_netsuite', name:'Oracle NetSuite', tier:'mid',
    sizeHint:{ minEmp: 80, maxEmp: 1500 }, revHint:[80e6, 1.2e9],
    tags:['cloud','saas','multi-entidade','global','serviços','distribuição'],
    keywords:['netsuite'] },

  { id:'d365_fo', name:'Dynamics 365 Finance', tier:'enterprise',
    sizeHint:{ minEmp: 500 }, revHint:[400e6, 5e9],
    tags:['azure','cloud','multi-entidade','governança','enterprise','global'],
    keywords:['dynamics 365 finance','d365 finance','finance and operations','d365 fo'] },

  { id:'d365_sc', name:'Dynamics 365 Supply Chain', tier:'enterprise',
    sizeHint:{ minEmp: 500 }, revHint:[400e6, 5e9],
    tags:['azure','cloud','manufatura','supply chain','enterprise','global'],
    keywords:['d365 supply chain','d365 sc','dynamics 365 scm'] },

  { id:'d365_bc', name:'Dynamics 365 Business Central', tier:'smb',
    sizeHint:{ maxEmp: 400 }, revHint:[20e6, 600e6],
    tags:['smb','azure','distribuição','serviços','cloud'],
    keywords:['business central','d365 bc','microsoft bc'] },

  { id:'totvs_protheus', name:'TOTVS Protheus', tier:'mid',
    sizeHint:{ minEmp: 80, maxEmp: 3000 }, revHint:[50e6, 2e9],
    tags:['brasil','fiscal forte','manufatura','serviços','distribuição'],
    keywords:['protheus','totvs'] },

  { id:'totvs_rm', name:'TOTVS RM', tier:'mid',
    sizeHint:{ minEmp: 50, maxEmp: 2000 }, revHint:[40e6, 1e9],
    tags:['serviços','educação','saúde','brasil'],
    keywords:['totvs rm'] },

  { id:'senior', name:'Senior', tier:'mid',
    sizeHint:{ minEmp: 100, maxEmp: 3000 }, revHint:[60e6, 1.5e9],
    tags:['manufatura','rh forte','brasil','serviços'],
    keywords:['senior sistemas','senior erp'] },

  { id:'sankhya', name:'Sankhya', tier:'mid',
    sizeHint:{ minEmp: 50, maxEmp: 2000 }, revHint:[30e6, 800e6],
    tags:['distribuição','serviços','indústria média','brasil'],
    keywords:['sankhya'] },

  { id:'omie', name:'Omie', tier:'smb',
    sizeHint:{ maxEmp: 200 }, revHint:[5e6, 120e6],
    tags:['micro e pequenas','serviços','saas'],
    keywords:['omie'] },

  { id:'tiny', name:'Tiny ERP', tier:'smb',
    sizeHint:{ maxEmp: 100 }, revHint:[2e6, 50e6],
    tags:['micro','e-commerce'],
    keywords:['tiny erp','tiny'] },

  { id:'custom', name:'Desenvolvimento próprio', tier:'varia',
    sizeHint:{}, tags:['in-house','legado'],
    keywords:['sistema próprio','in house','desenvolvimento próprio','house'] },
];

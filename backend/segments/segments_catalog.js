// backend/segments/segments_catalog.js
// Catálogo com 30 segmentos, suas variações de nome e a dor específica (com viés de tecnologia).
module.exports = [
  {
    segmento: "Tecnologia da Informação",
    variantes: ["ti","tecnologia","software house","provedor de software","saas","plataforma digital","empresa de tecnologia","desenvolvimento de software","startup tech","fornecedor de ti"],
    dor: "Pressão por escalar produto com confiabilidade e segurança, mantendo custos de cloud controlados e ciclos de release automatizados com observabilidade ponta a ponta."
  },
  {
    segmento: "Indústria Farmacêutica",
    variantes: ["farmaceutica","indústria farmacêutica","fabricante de medicamentos","laboratório","pharma","biofarma","fabricante de remédios","indústria de fármacos","ifas","life sciences"],
    dor: "Rastreabilidade regulatória e qualidade em lote, exigindo MES/ERP integrados, validação GxP e analytics para reduzir desvios e perdas na manufatura."
  },
  {
    segmento: "Alimentos e Bebidas",
    variantes: ["alimentos","bebidas","food & beverage","frigorífico","laticínios","indústria alimentícia","cervejaria","panificação","processamento de alimentos","f&b"],
    dor: "Previsão de demanda e controle de validade por lote, integrando ERP/WMS para reduzir ruptura e desperdício sob margens estreitas."
  },
  {
    segmento: "Varejo",
    variantes: ["retail","varejista","lojas","ecommerce","e-commerce","marketplace","magazine","supermercado","atacado-varejo","omnicanal"],
    dor: "Orquestrar experiência omnicanal com estoque unificado e precificação dinâmica, conectando loja física, e-commerce e last mile em tempo real."
  },
  {
    segmento: "Logística e Transporte",
    variantes: ["logistica","transportes","3pl","4pl","frete","armazém","wms","tms","last mile","transporte rodoviário"],
    dor: "Planejamento de rotas e visibilidade fim a fim para reduzir custo por entrega e atrasos, integrando TMS/WMS e telemetria."
  },
  {
    segmento: "Saúde (Hospitais e Clínicas)",
    variantes: ["saude","hospital","clínica","rede hospitalar","laboratório clínico","healthcare","prontuário","hmo","operadora de saúde","diagnóstico por imagem"],
    dor: "Integração clínica-assistencial e faturamento com auditoria, garantindo segurança de dados e agilidade no ciclo de receita."
  },
  {
    segmento: "Educação",
    variantes: ["universidade","faculdade","escola","edtech","instituição de ensino","ensino básico","ensino superior","curso livre","academia de ensino","e-learning"],
    dor: "Captação e retenção via jornadas digitais personalizadas, com CRM, billing e dados acadêmicos integrados para reduzir evasão."
  },
  {
    segmento: "Serviços Financeiros",
    variantes: ["banco","fintech","corretora","instituição financeira","meios de pagamento","financeira","adquirente","seguradora financeira","sistema financeiro","sfi"],
    dor: "Compliance e risco em tempo real com detecção de fraude e resoluções ágeis, mantendo escalabilidade e latência baixa em core transacional."
  },
  {
    segmento: "Seguros",
    variantes: ["seguradora","insurtech","corretora de seguros","previdência","resseguro","planos","auto seguro","vida e previdência","apólices","sinistros"],
    dor: "Automatizar subscrição e sinistros com dados externos e IA, reduzindo fraudes e tempo de indenização sob rigor regulatório."
  },
  {
    segmento: "Construção e Engenharia",
    variantes: ["construtora","engenharia","empreiteira","obras","incorporadora","infraestrutura","e&p obras","projetos civis","pmoc","bim"],
    dor: "Controle de custos por obra e cronograma, integrando orçamento, compras e campo (BIM/ERP) para mitigar estouro de prazo."
  },
  {
    segmento: "Óleo e Gás",
    variantes: ["petroleo e gas","o&g","exploração e produção","upstream","midstream","downstream","refino","distribuidora combustíveis","lubrificantes","gás natural"],
    dor: "Integridade de ativos e compliance regulatório, unificando manutenção preditiva, SCM crítico e rastreio fiscal."
  },
  {
    segmento: "Energia e Utilities",
    variantes: ["energia","utilities","eletricidade","saneamento","água e esgoto","distribuidora de energia","geração","transmissão","renováveis","utility"],
    dor: "Equilíbrio entre modernização da rede e redução de perdas, com medição inteligente, manutenção preditiva e billing integrado."
  },
  {
    segmento: "Setor Público",
    variantes: ["governo","prefeitura","órgão público","instituição pública","secretaria","estado","município","autarquia","fundação pública","setor governamental"],
    dor: "Transparência, compliance e prestação de contas com sistemas unificados e dados abertos, mantendo segurança e LGPD."
  },
  {
    segmento: "Agronegócio",
    variantes: ["agro","agrícola","agribusiness","cooperativa","trading agrícola","usina","commodities","agtech","produtor rural","cadeia do agro"],
    dor: "Visibilidade de safra a exportação, otimizando custos logísticos e integrando contratos, estoques e câmbio."
  },
  {
    segmento: "Automotivo",
    variantes: ["montadora","autopeças","fabricante de veículos","oficinas","concessionária","tier 1","tier 2","motocicletas","veículos comerciais","aftermarket"],
    dor: "Planejamento de demanda e cadeia de suprimentos just-in-time, com rastreabilidade por VIN e integração fornecedor-planta."
  },
  {
    segmento: "Aeroespacial e Defesa",
    variantes: ["aeroespacial","defesa","indústria aeronáutica","mro aeronáutico","fabricação aeronaves","sistemas de defesa","missões","aviônica","satélites","aeronáutica"],
    dor: "Configuração sob encomenda e compliance de exportação, com PLM/MES/ERP integrados e documentação auditável."
  },
  {
    segmento: "Mineração e Metais",
    variantes: ["mineracao","mineração","siderurgia","aço","ferro-gusa","metais","cimento","carvão","beneficiamento","metalurgia"],
    dor: "Otimização de ativos críticos e segurança operacional, integrando manutenção, despacho e controle de qualidade em tempo real."
  },
  {
    segmento: "Química",
    variantes: ["quimica","indústria química","resinas","tintas","fertilizantes","petroquímica","químicos especiais","gases industriais","adesivos","polímeros"],
    dor: "Gestão de fórmula e lote com requisitos EH&S, conectando P&D, produção e compliance para reduzir retrabalho."
  },
  {
    segmento: "Papel e Celulose",
    variantes: ["papel e celulose","pulp & paper","p&p","papel","celulose","florestal","manejo florestal","serraria","embalagens papel","kraft"],
    dor: "Controle de fibra e OEE com integração florestal-fábrica, maximizando rendimento e energia."
  },
  {
    segmento: "Bens de Consumo",
    variantes: ["cpg","consumo","bens de consumo","cosméticos","higiene","limpeza","embalagens","fast moving","fmcg","varejo cpg"],
    dor: "S&OP conectado e execução promocional orientada a dados, reduzindo ruptura e devoluções no sell-in/sell-out."
  },
  {
    segmento: "Eletrônicos",
    variantes: ["eletrônicos","componentes","dispositivos","hardware","ems","montagem eletrônica","semicondutores","iot devices","consumer electronics","pcb"],
    dor: "Planejamento de componentes voláteis e qualidade por lote, integrando PLM/MES para reduzir scrap e RMA."
  },
  {
    segmento: "Telecomunicações",
    variantes: ["telecom","operadora","provedor de internet","isp","telefonia","banda larga","5g","fibra","mvno","datacenter telecom"],
    dor: "Provisionamento rápido e billing convergente com baixa inadimplência, sob forte pressão por QoS e churn."
  },
  {
    segmento: "Imobiliário",
    variantes: ["real estate","incorporadora","gestora de imóveis","locação","condomínios","shoppings","lajes corporativas","proptech","fundos imobiliários","desenvolvimento imobiliário"],
    dor: "Gestão de portfólio e contratos com analytics de vacância e inadimplência, integrando obras, vendas e locações."
  },
  {
    segmento: "Turismo e Viagens",
    variantes: ["turismo","viagens","agência de viagens","operadora de turismo","consolidadora","btm","viagens corporativas","pacotes","hotelaria","lazer"],
    dor: "Inventário e tarifário integrados a múltiplos fornecedores, com conciliação e billing automatizados para margens apertadas."
  },
  {
    segmento: "Mídia e Entretenimento",
    variantes: ["mídia","entretenimento","publisher","streaming","produtora","canal","publicidade","conteúdo digital","games","estúdios"],
    dor: "Monetização de conteúdo com dados unificados, combatendo churn e fraudes em anúncios/assinaturas."
  },
  {
    segmento: "Têxtil e Vestuário",
    variantes: ["têxtil","vestuário","moda","confecção","malharia","calçados","acessórios","retail moda","fast fashion","apparel"],
    dor: "Coleção a coleção com lead time curto e visibilidade de fornecedores, conectando PLM, compras e lojas."
  },
  {
    segmento: "Metal Mecânico",
    variantes: ["metal mecânico","máquinas e equipamentos","usinagem","caldeiraria","bens de capital","oficinas industriais","manufatura discreta","equipamentos industriais","máquinas pesadas","mro industrial"],
    dor: "Engenharia sob pedido e controle de custos por projeto/ordem, integrando CAD/PLM e chão de fábrica."
  },
  {
    segmento: "Serviços Profissionais",
    variantes: ["consultoria","serviços especializados","outsourcing","bpo","escritório de advocacia","auditoria","engenharia consultiva","agência","serviços corporativos","profissional services"],
    dor: "Alocação e rentabilidade por contrato, com timesheet, faturamento recorrente e forecast de pipeline integrados."
  },
  {
    segmento: "Nonprofit e ONGs",
    variantes: ["ong","terceiro setor","instituto","fundação","filantrópica","associação","sem fins lucrativos","organização social","oscip","entidade filantrópica"],
    dor: "Transparência e prestação de contas a doadores, integrando captação, projetos e compliance com baixo custo administrativo."
  }
];

// segments/segments_catalog.js
// Catálogo de segmentos (aliases/keywords) + texto de dor.
// Garante export de FALLBACK_DOR e que TODO item tenha "dor" (string não vazia).

const FALLBACK_DOR =
  "Pressão contínua por redução de custos e ganho de eficiência operacional, elevando governança de ponta a ponta. " +
  "Adoção pragmática de IA para acelerar decisões e diferenciar-se da concorrência, " +
  "com digitalização robusta de processos críticos para escalar com segurança e previsibilidade.";

/**
 * Regras:
 * - segmento: nome canônico exibido no app
 * - aliases: formas alternativas de nomear o segmento (mín. 5-10 ajuda muito)
 * - keywords: termos característicos do segmento (ajudam no match quando o alias não bate)
 * - neg_keywords (opcional): termos que, se aparecerem, reduzem a confiança
 * - generic (opcional): true quando o segmento é muito amplo (punição leve no score)
 * - dor: até 1–2 frases; sempre incluir elemento de tecnologia conforme alinhado
 */
const SEGMENTOS = [
  // 1) Manufatura
  {
    segmento: "Manufatura",
    aliases: ["manufatura","indústria","industria","fabricação","fabrica","fabricante","produção","chão de fábrica","planta industrial","industrial"],
    keywords: ["mro","oee","capex","shopfloor","linha de produção","pcm","WMS","MES","MPS","MRP","qualidade","manutenção"],
    neg_keywords: [],
    generic: false,
    dor: "Unificar planejamento a chão de fábrica com rastreabilidade em tempo real, reduzindo refugos e paradas com IA para previsão de demanda, manutenção e qualidade."
  },

  // 2) Varejo
  {
    segmento: "Varejo",
    aliases: ["varejo","retail","loja","lojas","ecommerce","e-commerce","omnichannel","marketplace","atacado e varejo","distribuição varejista"],
    keywords: ["pdv","pos","estoque","ruptura","sazonalidade","last mile","fulfillment","cupom","promoção","sortimento","ticket médio"],
    neg_keywords: [],
    generic: false,
    dor: "Orquestrar omnichannel e estoques com previsão de demanda e preços dinâmicos, reduzindo ruptura e frete com automação e analytics embutidos no ERP."
  },

  // 3) Atacado e Distribuição
  {
    segmento: "Atacado e Distribuição",
    aliases: ["atacado","distribuição","distribuicao","wholesale","distribuidor","cash and carry","centro de distribuição","cd","logística b2b"],
    keywords: ["roteirização","picking","wms","cross-docking","lead time","lote","frete","tabela de preço","canal b2b","pedido mínimo"],
    neg_keywords: [],
    generic: false,
    dor: "Reduzir custo logístico e capital empatado com WMS/roteirização inteligente, integrando pedidos B2B e estoques em tempo real para giro saudável."
  },

  // 4) Agronegócio
  {
    segmento: "Agronegócio",
    aliases: ["agronegócio","agronegocio","agro","cooperativa","agricultura","usina","soja","cana","algodão","gado","pecuária"],
    keywords: ["safra","entressafra","armazém","commodities","rastreamento","fertilizante","insumo","balança","clima","exportação"],
    neg_keywords: [],
    generic: false,
    dor: "Planejar safra e contratos com visibilidade de custos por talhão e clima, conectando campo–indústria e usando IA para previsão e compliance de rastreabilidade."
  },

  // 5) Alimentos e Bebidas
  {
    segmento: "Alimentos e Bebidas",
    aliases: ["alimentos","bebidas","food and beverage","f&b","laticínios","cervejaria","panificação","frigorífico","abatedouro","fábrica de alimentos"],
    keywords: ["rastreabilidade","lote","validade","receita","formulação","qualidade","frias","temperatura","SIF","produção sazonal"],
    neg_keywords: [],
    generic: false,
    dor: "Assegurar rastreabilidade por lote e qualidade fim-a-fim, com planejamento de sazonalidade e redução de perdas via automação e sensores integrados ao ERP."
  },

  // 6) Farmacêutico
  {
    segmento: "Farmacêutico",
    aliases: ["farmacêutico","farmaceutico","indústria farmacêutica","fabricante de medicamentos","saúde pharma","biotech","cosméticos regulados"],
    keywords: ["anvisa","boas práticas","gmp","validação","lote","rastreabilidade","estabilidade","farmacovigilância","serialização","compliance"],
    neg_keywords: [],
    generic: false,
    dor: "Garantir conformidade ANVISA/GMP com rastreabilidade e validação, enquanto IA acelera P&D, previsão de demanda e evita quebras de estoque críticos."
  },

  // 7) Químico e Petroquímico
  {
    segmento: "Químico e Petroquímico",
    aliases: ["químico","quimico","petroquímico","petroquimico","tintas","resinas","fertilizantes","solventes","química fina","processo contínuo"],
    keywords: ["msds","fispq","formulação","batch","processo contínuo","rastreio","segurança","emissões","balanço de massa","compliance"],
    neg_keywords: [],
    generic: false,
    dor: "Controlar formulação e segurança de processos, com rastreio e balanço de massa em tempo real; IA reduz perdas e riscos operacionais e regulatórios."
  },

  // 8) Mineração e Siderurgia
  {
    segmento: "Mineração e Siderurgia",
    aliases: ["mineração","mineracao","siderurgia","aço","aco","minério","ferro gusa","pelotização","beneficiamento","fundição"],
    keywords: ["capex pesado","cadeia fria","preço spot","ferrovias","porto","manutenção pesada","oee","blendagem","contratos de venda"],
    neg_keywords: [],
    generic: false,
    dor: "Otimizar produção e manutenção pesada com analytics e IoT, reduzindo paradas e custos energéticos e aumentando previsibilidade de entregas."
  },

  // 9) Energia e Utilities
  {
    segmento: "Energia e Utilities",
    aliases: ["energia","utilities","distribuidora de energia","geração","transmissão","saneamento","água","gas","gás","eólica","solar"],
    keywords: ["ocp","aneel","tarifa","medição","perdas","smart meter","pi","iso 55000","manutenção","operação"],
    neg_keywords: [],
    generic: false,
    dor: "Digitalizar operação e manutenção de ativos críticos com IA para previsão de falhas, reduzindo perdas técnicas e atendendo regulação com governança."
  },

  // 10) Óleo e Gás
  {
    segmento: "Óleo e Gás",
    aliases: ["óleo e gás","oleo e gas","upstream","midstream","downstream","refino","onshore","offshore","poço","plataforma"],
    keywords: ["manutenção","integridade","supply chain","contratos","compliance","segurança de processo","paradas de planta","logística"],
    neg_keywords: [],
    generic: false,
    dor: "Maximizar disponibilidade de ativos e segurança de processo com manutenção preditiva e visibilidade de contratos/logística integrada."
  },

  // 11) Construção e Engenharia
  {
    segmento: "Construção e Engenharia",
    aliases: ["construção","construcao","engenharia","empreiteira","incorporadora","obras","civil","infraestrutura","canteiro","projetos EPC"],
    keywords: ["orçamento","cronograma","bdi","medição","obra","insumo","locação de equipamentos","contratos","fiscalização"],
    neg_keywords: [],
    generic: false,
    dor: "Controlar custos e prazos de obras com integração orçamento–execução, produtividade em campo e analytics para reduzir aditivos e retrabalhos."
  },

  // 12) Imobiliário
  {
    segmento: "Imobiliário",
    aliases: ["imobiliário","imobiliario","incorporação","incorporadora","aluguel","locação","condomínio","shopping","gestora de ativos"],
    keywords: ["vacância","vacancia","cap rate","locatário","contratos","iptu","ipca","obra","retrofit","pdm"],
    neg_keywords: [],
    generic: false,
    dor: "Unificar gestão do portfólio e contratos com projeções de vacância e receitas, automatizando rotinas financeiras e compliance para ganho de margem."
  },

  // 13) Saúde (Hospitais e Clínicas)
  {
    segmento: "Saúde (Hospitais e Clínicas)",
    aliases: ["saúde","saude","hospital","hospitais","clínica","clinica","laboratório","laboratorio","pronto atendimento","operadora de saúde"],
    keywords: ["prontuário","fila","leitos","otimização de escala","estoque crítico","farmácia","glosas","ans","audit"],
    neg_keywords: [],
    generic: false,
    dor: "Integrar assistencial e backoffice com estoques críticos, reduzindo glosas e tempos de atendimento; IA apoia alocação de leitos e previsões de demanda."
  },

  // 14) Educação
  {
    segmento: "Educação",
    aliases: ["educação","educacao","universidade","faculdade","escola","edtech","curso","instituição de ensino"],
    keywords: ["matrícula","evasão","currículo","ead","lms","captação","bolsa","aluno","secretaria","regulação"],
    neg_keywords: [],
    generic: false,
    dor: "Elevar captação e retenção com dados unificados, automatizar processos acadêmicos/financeiros e usar IA para personalizar jornadas de aprendizagem."
  },

  // 15) Governo e Setor Público
  {
    segmento: "Governo e Setor Público",
    aliases: ["governo","setor público","setor publico","prefeitura","estado","ministério","ministerio","autarquia","fundação","fundacao"],
    keywords: ["transparência","licitacao","licitacão","prestação de contas","lei de acesso","orçamento público","controle interno","compliance"],
    neg_keywords: [],
    generic: false,
    dor: "Aumentar transparência e eficiência do gasto público com processos digitais auditáveis, dados integrados e governança de ponta a ponta."
  },

  // 16) Logística e Transporte
  {
    segmento: "Logística e Transporte",
    aliases: ["logística","logistica","transporte","transportadora","cargas","fretelog","3pl","4pl","armazenagem","last mile"],
    keywords: ["tms","wms","tracking","ocioso","rota","janela","sla","entrega","otimização","combustível"],
    neg_keywords: [],
    generic: false,
    dor: "Otimizar redes e rotas para reduzir custo por entrega e atrasos, integrando TMS/WMS com tracking e IA para previsão e alocação de capacidade."
  },

  // 17) Aeroespacial e Defesa
  {
    segmento: "Aeroespacial e Defesa",
    aliases: ["aeroespacial","defesa","aviação","aviacao","mro aeronáutico","manutenção aeronáutica","fabricação aeronáutica","space"],
    keywords: ["certificação","engenharia de produto","mro","compliance","itars","export","supply chain crítico","documentação técnica"],
    neg_keywords: [],
    generic: false,
    dor: "Controlar ciclo de vida e MRO com rastreabilidade e compliance, usando IA para planejamento de peças, manutenção e documentação técnica."
  },

  // 18) Automotivo
  {
    segmento: "Automotivo",
    aliases: ["automotivo","montadora","autopeças","autopecas","veículos","veiculos","concessionária","oficina","tier 1","tier 2"],
    keywords: ["just in time","kanban","oee","recall","vin","fornecedor","qualidade","apqp","ppap","edi"],
    neg_keywords: [],
    generic: false,
    dor: "Orquestrar cadeia JIT com qualidade e rastreio VIN, prevendo demanda e otimizando estoques; IA reduz recalls e paradas de linha."
  },

  // 19) Tecnologia (Software & Serviços)
  {
    segmento: "Tecnologia (Software & Serviços)",
    aliases: ["tecnologia","software","saas","it services","ti","consultoria de ti","provedor de software","fábrica de software"],
    keywords: ["assinaturas","mr","churn","nps","backlog","roadmap","devops","ticket","sprint","pipeline"],
    neg_keywords: [],
    generic: false,
    dor: "Escalar receita recorrente com governança de projetos e suporte, medindo NPS/churn e automatizando billing; IA acelera triagem e sucesso do cliente."
  },

  // 20) Telecomunicações
  {
    segmento: "Telecomunicações",
    aliases: ["telecom","operadora","provedor de internet","isp","telefonia","banda larga","mvno","backbone"],
    keywords: ["oss","bss","churn","arpu","rede","nps","sla","atendimento","field service","capex rede"],
    neg_keywords: [],
    generic: false,
    dor: "Reduzir churn e custos de campo com OSS/BSS integrados e IA para priorizar tickets, otimizar rede e personalizar ofertas por perfil."
  },

  // 21) Mídia e Entretenimento
  {
    segmento: "Mídia e Entretenimento",
    aliases: ["mídia","midia","entretenimento","streaming","editoras","produtora","agência de mídia","agencia de midia","evento"],
    keywords: ["assinantes","ibope","audiência","direitos","catálogo","campanha","royalties","licenciamento","produção"],
    neg_keywords: [],
    generic: false,
    dor: "Unificar assinantes/anunciantes com analytics de audiência e gestão de direitos, aplicando IA para segmentar conteúdo e otimizar monetização."
  },

  // 22) Serviços Financeiros (Bancos)
  {
    segmento: "Serviços Financeiros (Bancos)",
    aliases: ["banco","bancos","serviços financeiros","servicos financeiros","instituição financeira","instituicao financeira","banco digital","fintech","financeira","banco de investimento"],
    keywords: ["conta corrente","pix","cartão","cartao","empréstimo","emprestimo","tesouraria","basileia","compliance","risco","core banking","open finance"],
    neg_keywords: [],
    generic: false,
    dor: "Modernizar core e integrações com segurança, reduzindo custos de operação e riscos regulatórios, usando IA para compliance, prevenção a fraudes e personalização."
  },

  // 23) Seguros
  {
    segmento: "Seguros",
    aliases: ["seguradora","seguros","insurtech","corretora de seguros","resseguro","plano de seguro"],
    keywords: ["sinistro","apólice","apolice","prêmio","premio","subscrição","fraude","regulação de sinistro","canal","corretor"],
    neg_keywords: [],
    generic: false,
    dor: "Digitalizar ciclo de apólices e sinistros com automação e IA para subscrição/fraude, reduzindo prazo de indenização e custos administrativos."
  },

  // 24) Aviação e Turismo (Operadores/Agências)
  {
    segmento: "Turismo",
    aliases: ["turismo","agência de viagens","agencias de viagem","viagens","operadora de turismo","pacotes turísticos","turismo corporativo","consolidadora","agência online","ota"],
    keywords: ["passagens","hotel","hospedagem","pacotes","milhas","corporativo","lazer","aéreo","reserva","roteiros"],
    neg_keywords: [],
    generic: false,
    dor: "Orquestrar canais e parceiros com automação e dados em tempo real, reduzindo custos de atendimento e fraudes, e usando IA para personalizar ofertas."
  },

  // 25) Bens de Consumo
  {
    segmento: "Bens de Consumo",
    aliases: ["bens de consumo","cpG","cpg","consumer goods","alimentos embalados","higiene e beleza","home care"],
    keywords: ["sell in","sell out","trade marketing","sazonalidade","sortimento","merchandising","preço","demanda"],
    neg_keywords: [],
    generic: false,
    dor: "Sincronizar sell-in/sell-out com demanda e trade, reduzindo ruptura e devoluções com analytics de canal e automação da execução em campo."
  },

  // 26) Moda e Têxtil
  {
    segmento: "Moda e Têxtil",
    aliases: ["moda","têxtil","textil","confecção","confeccao","vestuário","vestuario","calçados","calcados","malharia"],
    keywords: ["coleção","grade","sku","sazonalidade","ficha técnica","terceirização","ecommerce","omnichannel","atacado"],
    neg_keywords: [],
    generic: false,
    dor: "Planejar coleções e grades com previsões e visibilidade do terceirizado, integrando canais e reduzindo sobras com analytics de sortimento."
  },

  // 27) Papel e Celulose
  {
    segmento: "Papel e Celulose",
    aliases: ["papel","celulose","florestal","pulp","paper","tissue","kraft","embalagens de papel","floresta plantada"],
    keywords: ["capex","parada de máquina","qualidade","logística","contratos longos","exportação","rastreio","sustentabilidade"],
    neg_keywords: [],
    generic: false,
    dor: "Otimizar paradas de máquina e logística com integração ponta a ponta, aplicando IA para qualidade e previsão de demanda/exportações."
  },

  // 28) Portos e Terminais
  {
    segmento: "Portos e Terminais",
    aliases: ["porto","terminais","terminal portuário","terminal portuario","arrendatário","operador portuário","retroporto"],
    keywords: ["janela","atracação","atracacao","berço","berco","tup","anvisa","vigiagro","anvisa portos","operador portuário"],
    neg_keywords: [],
    generic: false,
    dor: "Orquestrar janelas, pátio e gate com automação e previsão, reduzindo demurrage e filas com integrações aduaneiras e governança de dados."
  },

  // 29) Serviços Profissionais
  {
    segmento: "Serviços Profissionais",
    aliases: ["serviços","servicos","consultoria","escritório","escritorio","agência","agencia","bpo","terceirização","outsourcing"],
    keywords: ["contrato","projeto","hora faturável","hora faturavel","timesheet","escopo","SLA","backlog","pipeline"],
    neg_keywords: [],
    generic: true,
    dor: "Padronizar ponta a ponta (proposta→entrega→faturamento) com automação/BI, elevando margens e previsibilidade; IA apoia alocação e estimativas."
  },

  // 30) Metalurgia e Máquinas
  {
    segmento: "Metalurgia e Máquinas",
    aliases: ["metalurgia","máquinas","maquinas","metal mecânico","metal mecanico","usinagem","fundição","forjaria","equipamentos industriais"],
    keywords: ["engenharia","ordem de produção","plano mestre","oee","setup","caldeiraria","qualidade","sob encomenda","projeto"],
    neg_keywords: [],
    generic: false,
    dor: "Conectar engenharia a produção sob encomenda, acelerando custos e prazos com PLM/MES integrados e IA para reduzir setup, refugos e retrabalhos."
  },
];

module.exports = { SEGMENTOS, FALLBACK_DOR };

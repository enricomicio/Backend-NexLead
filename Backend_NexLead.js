// App com layout estilizado inspirado nas telas fornecidas
import React, { useState } from 'react';
import { View, Text, TextInput, Button, ScrollView, StyleSheet } from 'react-native';

const BusinessCaseScreen = () => {
  const [showInputs, setShowInputs] = useState(true);
  const [inputs, setInputs] = useState({
    erpRecorrencia: '',
    erpImplementacao: '',
    fiscalRecorrencia: '',
    fiscalImplementacao: '',
    infra: '',
    suporte: '',
    outros: '',
  });

  const handleChange = (field, value) => {
    setInputs({ ...inputs, [field]: value });
  };

  const parseNumber = (value) => parseFloat(value.replace(/[^0-9]/g, '')) || 0;

  const getTotalAno1 = () => {
    return (
      parseNumber(inputs.erpRecorrencia) +
      parseNumber(inputs.fiscalRecorrencia) +
      parseNumber(inputs.infra) +
      parseNumber(inputs.suporte) +
      parseNumber(inputs.outros) +
      parseNumber(inputs.erpImplementacao) +
      parseNumber(inputs.fiscalImplementacao)
    );
  };

  const getTotalRecorrente = () => {
    return (
      parseNumber(inputs.erpRecorrencia) +
      parseNumber(inputs.fiscalRecorrencia) +
      parseNumber(inputs.infra) +
      parseNumber(inputs.suporte) +
      parseNumber(inputs.outros)
    );
  };

  const ipca = 0.04;
  const anos = 7;
  const valoresProposta = [];
  let total = getTotalAno1();
  valoresProposta.push(total);
  for (let i = 1; i < anos; i++) {
    total = valoresProposta[i - 1] + getTotalRecorrente() * Math.pow(1 + ipca, i);
    valoresProposta.push(total);
  }

  if (showInputs) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Nova Solução – Entrada de Valores</Text>
        <Text style={styles.subtitle}>Informe os custos ANUAIS da solução que será proposta. Todos os campos são opcionais.</Text>

        <View style={styles.sectionCard}>
          <Text style={styles.label}>Recorrência ERP (R$):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ex: 150000" onChangeText={(text) => handleChange('erpRecorrencia', text)} />

          <Text style={styles.label}>Implementação ERP (R$):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ex: 300000" onChangeText={(text) => handleChange('erpImplementacao', text)} />

          <Text style={styles.label}>Recorrência Solução Fiscal (R$):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ex: 40000" onChangeText={(text) => handleChange('fiscalRecorrencia', text)} />

          <Text style={styles.label}>Implementação Solução Fiscal (R$):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ex: 10000" onChangeText={(text) => handleChange('fiscalImplementacao', text)} />

          <Text style={styles.label}>Infraestrutura (R$):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ex: 50000" onChangeText={(text) => handleChange('infra', text)} />

          <Text style={styles.label}>Suporte / AMS (R$):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ex: 60000" onChangeText={(text) => handleChange('suporte', text)} />

          <Text style={styles.label}>Outros Custos (R$):</Text>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="Ex: 20000" onChangeText={(text) => handleChange('outros', text)} />
        </View>

        <Button title="Gerar Análise" onPress={() => setShowInputs(false)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Business Case</Text>
      <Text style={styles.subtitle}>Análise Estratégica – Grupo InovaLog</Text>

      <View style={styles.sectionCard}>
        <Text style={styles.label}>Faturamento anual: <Text style={styles.value}>R$ 420.000.000</Text></Text>
        <Text style={styles.criterio}>Critério: Receita estimada via porte + CNAE industrial</Text>

        <Text style={styles.label}>Qtd. de Funcionários: <Text style={styles.value}>850</Text></Text>
        <Text style={styles.criterio}>Critério: Base CNPJ + LinkedIn</Text>

        <Text style={styles.label}>Investimento anual em TI: <Text style={styles.value}>R$ 8.400.000</Text></Text>
        <Text style={styles.criterio}>Critério: 2% sobre faturamento</Text>

        <Text style={styles.label}>ERP atual: <Text style={styles.value}>SAP ECC</Text></Text>
        <Text style={styles.criterio}>Critério: Padrão em grupos industriais + anúncios de vagas</Text>

        <Text style={styles.label}>Solução fiscal: <Text style={styles.value}>Thomson Reuters ONESOURCE</Text></Text>
        <Text style={styles.criterio}>Critério: Compatível com SAP ECC e indicado em notícias</Text>

        <Text style={styles.label}>Qtd. estimada de usuários ERP: <Text style={styles.value}>200</Text></Text>
        <Text style={styles.criterio}>Critério: Aproximadamente 23% do total de funcionários (padrão em empresas industriais)</Text>
      </View>

      <Text style={styles.tableTitle}>Projeção de Custos (7 anos com IPCA de 4% a.a.)</Text>

      <View style={styles.tableRowHeader}>
        <Text style={styles.tableHeader}>Ano</Text>
        <Text style={styles.tableHeader}>Atual</Text>
        <Text style={styles.tableHeader}>Nova Solução</Text>
      </View>
      {valoresProposta.map((val, index) => (
        <View key={index} style={styles.tableRow}>
          <Text style={styles.tableCell}>{index + 1}</Text>
          <Text style={styles.tableCell}>R$ {(2000000 * Math.pow(1.04, index)).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</Text>
          <Text style={styles.tableCell}>R$ {val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</Text>
        </View>
      ))}

      <View style={styles.sectionCard}>
        <Text style={styles.label}>Critério para estimativa de custos atuais:</Text>
        <Text style={styles.criterio}>ERP: baseado em valor médio de licenciamento SAP ECC para empresas com +200 usuários.</Text>
        <Text style={styles.criterio}>Solução fiscal: média praticada por Thomson Reuters em clientes SAP no mesmo porte.</Text>
        <Text style={styles.criterio}>Suporte: estimativa com base em AMS de nível nacional (outsourcing parcial).</Text>
        <Text style={styles.criterio}>Infraestrutura: assumido ambiente híbrido (cloud + servidores locais).</Text>
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryText}>✅ Payback estimado: entre ano 2 e 3</Text>
        <Text style={styles.summaryText}>💰 Economia acumulada em 7 anos: R$ {((2000000 * 7.9) - valoresProposta[6]).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</Text>
        <Text style={styles.summaryText}>📌 Recomendação: Forte potencial de ganho operacional e financeiro. Avançar com a proposta.</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f9fc'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#003B73',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
    marginBottom: 25,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    marginBottom: 25,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222'
  },
  value: {
    fontWeight: 'normal',
    color: '#003B73'
  },
  criterio: {
    fontSize: 12,
    color: '#777',
    marginBottom: 12,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: '#003B73'
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#005f9e',
    paddingVertical: 10,
    borderRadius: 5,
  },
  tableHeader: {
    flex: 1,
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tableCell: {
    flex: 1,
    textAlign: 'center',
    color: '#333'
  },
  summaryBox: {
    backgroundColor: '#e8f4ff',
    padding: 15,
    borderRadius: 8,
    marginTop: 20
  },
  summaryText: {
    fontSize: 14,
    color: '#003B73',
    marginBottom: 5
  },
  input: {
    backgroundColor: '#f1f1f1',
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  }
});

export default BusinessCaseScreen;



"use client";

import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import { formatCep } from "@/lib/agregados";

// Endereço postal (rua, número, complemento, bairro, CEP, município) — os
// campos que o e-Frete pede para contratado e motorista no CIOT.

export interface PostalAddress {
  street: string;
  number: string;
  complement: string;
  district: string;
  cep: string;
  city: string;
}

export const emptyPostalAddress: PostalAddress = {
  street: "",
  number: "",
  complement: "",
  district: "",
  cep: "",
  city: "",
};

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";

export function PostalAddressFields({
  idPrefix,
  value,
  onChange,
  cityOptions,
}: {
  idPrefix: string;
  value: PostalAddress;
  onChange: (next: PostalAddress) => void;
  cityOptions: SearchOption[];
}) {
  const set = (field: keyof PostalAddress, v: string) => onChange({ ...value, [field]: v });
  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-6 sm:col-span-4">
        <label className={labelCls} htmlFor={`${idPrefix}-rua`}>Rua</label>
        <input id={`${idPrefix}-rua`} className={inputCls} value={value.street} onChange={(e) => set("street", e.target.value)} />
      </div>
      <div className="col-span-3 sm:col-span-2">
        <label className={labelCls} htmlFor={`${idPrefix}-numero`}>Número</label>
        <input id={`${idPrefix}-numero`} className={inputCls} value={value.number} onChange={(e) => set("number", e.target.value)} />
      </div>
      <div className="col-span-3 sm:col-span-2">
        <label className={labelCls} htmlFor={`${idPrefix}-compl`}>Complemento</label>
        <input id={`${idPrefix}-compl`} className={inputCls} value={value.complement} onChange={(e) => set("complement", e.target.value)} />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <label className={labelCls} htmlFor={`${idPrefix}-bairro`}>Bairro</label>
        <input id={`${idPrefix}-bairro`} className={inputCls} value={value.district} onChange={(e) => set("district", e.target.value)} />
      </div>
      <div className="col-span-6 sm:col-span-2">
        <label className={labelCls} htmlFor={`${idPrefix}-cep`}>CEP</label>
        <input
          id={`${idPrefix}-cep`}
          inputMode="numeric"
          className={inputCls}
          value={value.cep}
          onChange={(e) => set("cep", formatCep(e.target.value))}
          placeholder="00000-000"
        />
      </div>
      <div className="col-span-6">
        <label className={labelCls} htmlFor={`${idPrefix}-municipio`}>Município</label>
        <SearchSelect
          id={`${idPrefix}-municipio`}
          value={value.city}
          onChange={(v) => set("city", v)}
          options={cityOptions}
          placeholder="Digite para procurar (ex: Curitiba/PR)"
          className={inputCls}
        />
      </div>
    </div>
  );
}

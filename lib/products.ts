import productsData from '@/output/products.json';

export type Product = {
  id: string;
  filename: string;
  name: string;
  price: number;
  price_display: string;
  hook: string;
  sub_hook: string;
  details: string[];
  process: string[];
  google_form_url: string;
  kakaopay_link: string;
  naverpay_link: string;
  post_payment_text: string;
  openchat_link: string;
  openchat_label: string;
  meta_desc: string;
  form_endpoint?: string;
};

export const products: Product[] = productsData.products as Product[];

export function getProduct(filename: string): Product | undefined {
  return products.find((p) => p.filename === filename);
}

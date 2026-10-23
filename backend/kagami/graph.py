"""Graph edges reflect verified permissions; no inferred downstream control."""
from backend.models.kagami import Edge, Graph, Node, Permission


def build_graph(wallet: str, permissions: list[Permission]) -> Graph:
    nodes = [Node(id='wallet', kind='wallet', label='Investigated wallet', address=wallet, position={'x': 0.0, 'y': 0.0})]
    edges = []
    for i, permission in enumerate(permissions):
        # Zero allowances are preserved in the table but are not active authority paths.
        if not permission.active:
            continue
        key = permission.id
        nodes.append(Node(id=key, kind='permission', label=permission.title, permission_id=key,
                          position={'x': 300.0, 'y': float(i * 170)}))
        nodes.append(Node(id=key + '-spender', kind='delegation' if permission.type == 'delegation' else 'spender',
                          label=permission.spender, address=permission.spender, permission_id=key,
                          position={'x': 640.0, 'y': float(i * 170)}))
        edges.extend([
            Edge(id=key + '-grant', source='wallet', target=key, label='Verified permission', permission_id=key, evidence_ids=permission.evidence_ids),
            Edge(id=key + '-authority', source=key, target=key + '-spender', label='Designates code' if permission.type == 'delegation' else 'Token spending allowance', permission_id=key, evidence_ids=permission.evidence_ids),
        ])
        if permission.token:
            nodes.append(Node(id=key + '-token', kind='token', label=permission.symbol or permission.token,
                              address=permission.token, permission_id=key,
                              position={'x': 300.0, 'y': float(i * 170 + 90)}))
            edges.append(Edge(id=key + '-asset', source=key, target=key + '-token', label='Applies to token', permission_id=key, evidence_ids=permission.evidence_ids))
    return Graph(nodes=nodes, edges=edges)

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from typing import Any

from flask import Flask, jsonify, request

app = Flask(__name__)

TEST_FILE_RE = re.compile(r"(?:^|[/\\])tests?[/\\]|(?:_test\.py$)|(?:test_.*\.py$)", re.IGNORECASE)


@dataclass
class FunctionMetric:
    name: str
    loc: int
    complexity: int
    params: int


def _is_decision_node(node: ast.AST) -> bool:
    return isinstance(
        node,
        (
            ast.If,
            ast.For,
            ast.AsyncFor,
            ast.While,
            ast.Try,
            ast.BoolOp,
            ast.IfExp,
            ast.Match,
            ast.ExceptHandler,
            ast.comprehension,
        ),
    )


def _estimate_function_complexity(func_node: ast.AST) -> int:
    complexity = 1
    for child in ast.walk(func_node):
        if _is_decision_node(child):
            complexity += 1
    return complexity


def _function_loc(node: ast.AST, fallback_loc: int) -> int:
    start = getattr(node, "lineno", None)
    end = getattr(node, "end_lineno", None)
    if isinstance(start, int) and isinstance(end, int) and end >= start:
        return max(1, end - start + 1)
    return max(1, fallback_loc)


def _extract_imports(tree: ast.Module) -> list[str]:
    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            imports.append(module)
    return imports


def _extract_exports(tree: ast.Module) -> list[str]:
    exports: list[str] = []

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if not node.name.startswith("_"):
                exports.append(node.name)

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "__all__":
                    if isinstance(node.value, (ast.List, ast.Tuple)):
                        for element in node.value.elts:
                            if isinstance(element, ast.Constant) and isinstance(element.value, str):
                                exports.append(element.value)

    return sorted(set(exports))


def analyze_python_file(path: str, content: str, loc: int) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": path,
        "loc": loc,
        "functions": [],
        "imports": [],
        "exports": [],
        "isTestFile": bool(TEST_FILE_RE.search(path)),
    }

    try:
        tree = ast.parse(content)
    except SyntaxError as error:
        result["parseError"] = f"SyntaxError: {error.msg}"
        return result

    function_metrics: list[FunctionMetric] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            params = len(node.args.args) + len(node.args.kwonlyargs)
            if node.args.vararg:
                params += 1
            if node.args.kwarg:
                params += 1
            function_metrics.append(
                FunctionMetric(
                    name=node.name,
                    loc=_function_loc(node, loc),
                    complexity=_estimate_function_complexity(node),
                    params=params,
                )
            )

    result["functions"] = [
        {
            "name": metric.name,
            "loc": metric.loc,
            "complexity": metric.complexity,
            "params": metric.params,
        }
        for metric in function_metrics
    ]
    result["imports"] = _extract_imports(tree)
    result["exports"] = _extract_exports(tree)

    return result


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.post("/analyze-python")
def analyze_python() -> Any:
    payload = request.get_json(silent=True) or {}
    files = payload.get("files")

    if not isinstance(files, list):
        return jsonify({"error": "Body must include a 'files' array"}), 400

    metrics: list[dict[str, Any]] = []
    for item in files:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path", ""))
        content = str(item.get("content", ""))
        loc = int(item.get("loc", max(1, content.count("\n") + 1)))
        metrics.append(analyze_python_file(path, content, loc))

    return jsonify({"metrics": metrics})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
